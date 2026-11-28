import 'reflect-metadata';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Controller,
  Delete,
  Get,
  Post,
  RequestMethod,
  type Type,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { MetadataScanner, Reflector } from '@nestjs/core';
import { findSqlConcatenation } from '../appointments/testing/sql-concatenation-scan.js';
import { IS_PUBLIC_KEY, Public } from '../auth/decorators/public.decorator.js';
import { Roles, ROLES_KEY } from '../auth/decorators/roles.decorator.js';
import {
  listSourceFiles,
  readSource,
  stripComments,
} from '../doctor/testing/architecture-scan.js';
import { ADMIN_SCOPE_KEY } from '../rbac/admin-scope.js';
import { RequireAdminScope } from '../rbac/decorators/require-admin-scope.decorator.js';
import { AdminScopeGuard } from '../rbac/guards/admin-scope.guard.js';
import { auditPublicControllers } from '../search/testing/public-route-audit.js';
import { ARTICLE_TABLES } from './article.constants.js';
import { ArticleModule } from './article.module.js';

// article B1 — ABQ-05 (PLAN article 7.2; T9): quét metadata của controller trong `ArticleModule` và mã nguồn `src/article` (bỏ test và thư mục `testing/`).
// Mỗi luật có ĐỐI CHỨNG ÂM (controller giả hay nguồn giả vi phạm thì bị bắt) để luật không xanh vì quét sai chỗ.
// B1 chưa có route công khai và chưa có route `patient/`: các luật cho hai nhóm đó vẫn chạy và nhận danh sách RỖNG; article B2 (công khai) và B3 (đánh giá) thêm controller vào
// ArticleModule là TỰ được quét, không phải sửa file này. Luật "tiền tố lạ" chặn controller đặt ngoài ba nhóm admin, public, patient.
const ARTICLE_DIR = fileURLToPath(new URL('.', import.meta.url));

const sources = listSourceFiles(ARTICLE_DIR).map((file) => ({
  file: relative(ARTICLE_DIR, file),
  code: stripComments(readSource(file)),
}));

interface RouteInfo {
  controller: Type<unknown>;
  name: string;
  method: RequestMethod;
  /** Đường dẫn đầy đủ (không có `/` đầu và cuối). */
  path: string;
  handler: Function;
}

const toPaths = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : typeof value === 'string'
      ? [value]
      : [''];

/** Mọi route của các controller đã cho (mỗi cặp đường dẫn lớp và đường dẫn hàm là một route). */
function routesOf(controllers: readonly Type<unknown>[]): RouteInfo[] {
  const scanner = new MetadataScanner();
  const routes: RouteInfo[] = [];
  for (const controller of controllers) {
    const prototype = controller.prototype as Record<string, unknown>;
    const roots = toPaths(Reflect.getMetadata(PATH_METADATA, controller));
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name];
      if (
        typeof handler !== 'function' ||
        Reflect.getMetadata(METHOD_METADATA, handler) === undefined
      )
        continue;
      const method = Reflect.getMetadata(
        METHOD_METADATA,
        handler,
      ) as RequestMethod;
      for (const root of roots)
        for (const leaf of toPaths(Reflect.getMetadata(PATH_METADATA, handler)))
          routes.push({
            controller,
            name,
            method,
            path: [root, leaf]
              .filter(Boolean)
              .join('/')
              .replace(/^\/+|\/+$/g, ''),
            handler,
          });
    }
  }
  return routes;
}

const reflector = new Reflector();
const prefixOf = (path: string): string => path.split('/')[0] ?? '';

/** Lỗi bảo vệ của route quản trị: đúng một vai Quản trị viên, phạm vi Toàn hệ thống, có `AdminScopeGuard`, không `@Public`, và không có route DELETE bài. */
function adminFailures(routes: readonly RouteInfo[]): string[] {
  const failures: string[] = [];
  for (const route of routes.filter((r) => prefixOf(r.path) === 'admin')) {
    const targets = [route.handler, route.controller];
    const where = `${route.controller.name}.${route.name}`;
    const roles = reflector.getAllAndOverride<string[] | undefined>(
      ROLES_KEY,
      targets,
    );
    if (roles?.length !== 1 || roles[0] !== 'QuanTriVien')
      failures.push(`${where}: thiếu @Roles('QuanTriVien')`);
    if (
      reflector.getAllAndOverride<unknown>(ADMIN_SCOPE_KEY, targets) !==
      'ToanHeThong'
    )
      failures.push(`${where}: thiếu @RequireAdminScope('ToanHeThong')`);
    const guards = reflector.getAllAndMerge<unknown[]>(
      GUARDS_METADATA,
      targets,
    );
    if (!guards.includes(AdminScopeGuard))
      failures.push(`${where}: thiếu AdminScopeGuard`);
    if (reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) === true)
      failures.push(`${where}: là @Public`);
    if (
      route.method === RequestMethod.DELETE &&
      /^admin\/articles(\/|$)/.test(route.path)
    )
      failures.push(
        `${where}: có route DELETE bài viết (chỉ lưu trữ, không xoá)`,
      );
  }
  return failures;
}

/** Lỗi của route `patient/`: phải có đúng `@Roles('BenhNhan')`. */
function patientFailures(routes: readonly RouteInfo[]): string[] {
  return routes
    .filter((r) => prefixOf(r.path) === 'patient')
    .flatMap((route) => {
      const roles = reflector.getAllAndOverride<string[] | undefined>(
        ROLES_KEY,
        [route.handler, route.controller],
      );
      return roles?.length === 1 && roles[0] === 'BenhNhan'
        ? []
        : [`${route.controller.name}.${route.name}: thiếu @Roles('BenhNhan')`];
    });
}

/** Route ngoài ba nhóm admin, public, patient. */
function strayFailures(routes: readonly RouteInfo[]): string[] {
  return routes
    .filter((r) => !['admin', 'public', 'patient'].includes(prefixOf(r.path)))
    .map(
      (route) =>
        `${route.controller.name}.${route.name}: tiền tố lạ "${prefixOf(route.path)}"`,
    );
}

/** Controller có ít nhất một route công khai (để đưa vào `auditPublicControllers`). */
const publicControllersOf = (routes: readonly RouteInfo[]): Type<unknown>[] => [
  ...new Set(
    routes
      .filter((r) => prefixOf(r.path) === 'public')
      .map((r) => r.controller),
  ),
];

const moduleControllers = (Reflect.getMetadata('controllers', ArticleModule) ??
  []) as Type<unknown>[];
const moduleRoutes = routesOf(moduleControllers);

describe('article B1 — kiến trúc: route (ABQ-05, T9)', () => {
  it('có controller và route để quét (chống quét rỗng); B1 chỉ có route quản trị', () => {
    expect(moduleControllers.map((c) => c.name).sort()).toEqual([
      'ArticleAdminController',
      'HashtagAdminController',
    ]);
    expect(
      moduleRoutes.map((r) => `${RequestMethod[r.method]} ${r.path}`).sort(),
    ).toEqual([
      'GET admin/articles',
      'GET admin/articles/:id',
      'GET admin/hashtags',
      'PATCH admin/articles/:id',
      'POST admin/articles',
    ]);
  });

  it("ABQ-05: mọi route admin có @Roles('QuanTriVien'), @RequireAdminScope('ToanHeThong'), AdminScopeGuard, không @Public, không DELETE bài; đối chứng âm: controller giả thiếu thì bị bắt", () => {
    @Controller('admin/articles')
    class NoProtection {
      @Get()
      list() {
        return null;
      }
    }
    @Controller('admin/articles')
    @Roles('QuanTriVien')
    @RequireAdminScope('Any')
    class AnyScope {
      @Get()
      list() {
        return null;
      }
    }
    @Controller('admin/articles')
    @RequireAdminScope('ToanHeThong')
    class NoRoles {
      @Get()
      list() {
        return null;
      }
    }
    @Controller('admin/articles')
    @Roles('QuanTriVien', 'LeTan')
    @RequireAdminScope('ToanHeThong')
    class TwoRoles {
      @Get()
      list() {
        return null;
      }
    }
    @Controller('admin/articles')
    @Roles('QuanTriVien')
    @RequireAdminScope('ToanHeThong')
    @Public()
    class PublicAdmin {
      @Get()
      list() {
        return null;
      }
    }
    @Controller('admin/articles')
    @Roles('QuanTriVien')
    @RequireAdminScope('ToanHeThong')
    class WithDelete {
      @Delete(':id')
      remove() {
        return null;
      }
    }
    expect(adminFailures(routesOf([NoProtection]))).toEqual([
      "NoProtection.list: thiếu @Roles('QuanTriVien')",
      "NoProtection.list: thiếu @RequireAdminScope('ToanHeThong')",
      'NoProtection.list: thiếu AdminScopeGuard',
    ]);
    expect(adminFailures(routesOf([AnyScope]))).toEqual([
      "AnyScope.list: thiếu @RequireAdminScope('ToanHeThong')",
    ]);
    expect(adminFailures(routesOf([NoRoles]))).toEqual([
      "NoRoles.list: thiếu @Roles('QuanTriVien')",
    ]);
    expect(adminFailures(routesOf([TwoRoles]))).toEqual([
      "TwoRoles.list: thiếu @Roles('QuanTriVien')",
    ]);
    expect(adminFailures(routesOf([PublicAdmin]))).toEqual([
      'PublicAdmin.list: là @Public',
    ]);
    expect(adminFailures(routesOf([WithDelete]))).toEqual([
      'WithDelete.remove: có route DELETE bài viết (chỉ lưu trữ, không xoá)',
    ]);
    expect(adminFailures(moduleRoutes)).toEqual([]);
  });

  it('ABQ-05: route public qua auditPublicControllers (chỉ GET, public/, @Public, không @Roles); B1 chưa có route public nên rỗng; đối chứng âm: controller giả bị bắt', () => {
    @Controller('public/articles')
    class MissingPublic {
      @Get()
      list() {
        return null;
      }
    }
    @Controller('public/articles')
    @Public()
    class WritesAndRoles {
      @Post()
      @Roles('BenhNhan')
      create() {
        return null;
      }
    }
    @Controller('public/articles')
    @Public()
    class Good {
      @Get()
      list() {
        return null;
      }
    }
    expect(publicControllersOf(routesOf([MissingPublic]))).toEqual([
      MissingPublic,
    ]);
    expect(
      auditPublicControllers(publicControllersOf(routesOf([MissingPublic]))),
    ).toEqual(['MissingPublic.list: thiếu @Public']);
    expect(
      auditPublicControllers(publicControllersOf(routesOf([WritesAndRoles]))),
    ).toEqual(['WritesAndRoles.create: không phải GET; có @Roles']);
    expect(
      auditPublicControllers(publicControllersOf(routesOf([Good]))),
    ).toEqual([]);
    // Mã thật: B1 chưa có controller công khai; B2 thêm vào ArticleModule là tự bị quét ở đây
    expect(publicControllersOf(moduleRoutes)).toEqual([]);
    expect(auditPublicControllers(publicControllersOf(moduleRoutes))).toEqual(
      [],
    );
  });

  it("ABQ-05: mọi route patient/ có @Roles('BenhNhan'); B1 chưa có route patient; đối chứng âm: controller giả thiếu thì bị bắt", () => {
    @Controller('patient/articles/:id/rating')
    class NoRoles {
      @Get()
      get() {
        return null;
      }
    }
    @Controller('patient/articles/:id/rating')
    @Roles('BenhNhan')
    class Good {
      @Get()
      get() {
        return null;
      }
      @Delete()
      remove() {
        return null;
      }
    }
    expect(patientFailures(routesOf([NoRoles]))).toEqual([
      "NoRoles.get: thiếu @Roles('BenhNhan')",
    ]);
    expect(patientFailures(routesOf([Good]))).toEqual([]);
    expect(patientFailures(moduleRoutes)).toEqual([]);
  });

  it('ABQ-05: không route ngoài ba nhóm admin, public, patient; đối chứng âm: tiền tố lạ bị bắt', () => {
    @Controller('articles')
    class Stray {
      @Get()
      list() {
        return null;
      }
    }
    expect(strayFailures(routesOf([Stray]))).toEqual([
      'Stray.list: tiền tố lạ "articles"',
    ]);
    expect(strayFailures(moduleRoutes)).toEqual([]);
  });
});

// Luật nguồn: chỉ ghi bốn bảng của article, SQL tham số hoá, không `SELECT *`, không `console`, chỉ import hạ tầng dùng chung.
const WRITE_TARGET =
  /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+`?([a-z_][a-z0-9_]*)`?/gi;
const SELECT_STAR = /SELECT\s+(?:DISTINCT\s+)?(?:\w+\.)?\*/i;
const CONSOLE = /\bconsole\./;

/** Bảng bị ghi (INSERT, UPDATE, DELETE) trong một đoạn mã. `UPDATE` sau `ON DUPLICATE KEY` không phải câu ghi bảng riêng. */
function writtenTables(code: string): string[] {
  const tables: string[] = [];
  for (const match of code.matchAll(WRITE_TARGET)) {
    const before = code.slice(
      Math.max(0, (match.index ?? 0) - 15),
      match.index,
    );
    if (/KEY\s+$/i.test(before)) continue;
    tables.push((match[1] ?? '').toLowerCase());
  }
  return tables;
}

const forbiddenWrites = (code: string): string[] =>
  writtenTables(code).filter(
    (table) => !(ARTICLE_TABLES as readonly string[]).includes(table),
  );

/** Chỗ ngoài `article/` được import: hạ tầng dùng chung, không có service hay repository của module khác. */
const ALLOWED_EXTERNAL = [
  /^(\.\.\/)+common\//,
  /^(\.\.\/)+rbac\//,
  /^(\.\.\/)+auth\/decorators\//,
  /^(\.\.\/)+notification\/center\/notification-center\.module\.js$/,
  /^(\.\.\/)+database\/mysql-errors\.js$/,
];
const PACKAGE_IMPORT =
  /^(@nestjs\/|typeorm$|class-validator$|class-transformer$)/;
const IMPORT_FROM = /\bfrom\s+'([^']+)'/g;

function forbiddenImports(file: string, code: string): string[] {
  const depth = file.split(/[\\/]/).length - 1;
  const leave = '../'.repeat(depth + 1);
  return [...code.matchAll(IMPORT_FROM)]
    .map((match) => match[1] ?? '')
    .filter((target) => {
      if (PACKAGE_IMPORT.test(target) || target.startsWith('node:'))
        return false;
      if (!target.startsWith(leave)) return !target.startsWith('.');
      return !ALLOWED_EXTERNAL.some((rule) => rule.test(target));
    });
}

describe('article B1 — kiến trúc: mã nguồn (ABQ-05)', () => {
  it('có mã nguồn để quét (chống quét rỗng)', () => {
    expect(sources.length).toBeGreaterThanOrEqual(12);
    expect(sources.map((s) => s.file)).toContain('article.module.ts');
  });

  it('ABQ-05: chỉ ghi bốn bảng của article; đối chứng âm: ghi bảng khác bị bắt, ON DUPLICATE KEY UPDATE không tính', () => {
    expect(forbiddenWrites("q('UPDATE tai_khoan SET a = 1')")).toEqual([
      'tai_khoan',
    ]);
    expect(
      forbiddenWrites("q('INSERT INTO thong_bao (a) VALUES (?)')"),
    ).toEqual(['thong_bao']);
    expect(forbiddenWrites("q('DELETE FROM chuyen_khoa WHERE a = ?')")).toEqual(
      ['chuyen_khoa'],
    );
    expect(
      forbiddenWrites(
        "q('INSERT INTO hashtag (ten) VALUES (?) ON DUPLICATE KEY UPDATE hashtag_id = LAST_INSERT_ID(hashtag_id)')",
      ),
    ).toEqual([]);
    expect(
      sources.flatMap(({ file, code }) =>
        forbiddenWrites(code).map((table) => `${file}: ${table}`),
      ),
    ).toEqual([]);
    // Phép quét không rỗng: mã thật có ghi ba bảng (B1 chưa ghi phiếu đánh giá, đó là việc của B3)
    const written = new Set(sources.flatMap(({ code }) => writtenTables(code)));
    expect([...written].sort()).toEqual(
      ['bai_viet', 'bai_viet_hashtag', 'hashtag'].sort(),
    );
  });

  it('ABQ-05: SQL tham số hoá (không nối chuỗi giá trị), không `SELECT *`, không `console`; đối chứng âm bị bắt', () => {
    expect(
      findSqlConcatenation(
        'const q = `SELECT 1 FROM bai_viet WHERE id = ${id}`;',
      ),
    ).not.toEqual([]);
    expect(
      findSqlConcatenation(
        "const q = 'SELECT 1 FROM bai_viet WHERE id = ' + id;",
      ),
    ).not.toEqual([]);
    expect(SELECT_STAR.test('SELECT * FROM bai_viet')).toBe(true);
    expect(SELECT_STAR.test('SELECT b.* FROM bai_viet b')).toBe(true);
    expect(SELECT_STAR.test('SELECT COUNT(*) AS n FROM bai_viet')).toBe(false);
    expect(CONSOLE.test('console.log(x)')).toBe(true);
    for (const { file, code } of sources) {
      expect(findSqlConcatenation(code), file).toEqual([]);
      expect(SELECT_STAR.test(code), file).toBe(false);
      expect(CONSOLE.test(code), file).toBe(false);
    }
  });

  it('ABQ-05: chỉ import hạ tầng dùng chung (common, rbac, auth/decorators, noStore của thông báo, mysql-errors), không service của module khác; đối chứng âm', () => {
    expect(
      forbiddenImports(
        'admin/x.ts',
        "import { A } from '../../admin/specialties/specialty.service.js';",
      ),
    ).toHaveLength(1);
    expect(
      forbiddenImports('admin/x.ts', "import { A } from 'lodash';"),
    ).toHaveLength(1);
    expect(
      forbiddenImports(
        'admin/x.ts',
        "import { A } from '../../common/time/time.js'; import { B } from '../common/y.js'; import { C } from 'node:path';",
      ),
    ).toEqual([]);
    expect(
      sources.flatMap(({ file, code }) =>
        forbiddenImports(file, code).map((target) => `${file}: ${target}`),
      ),
    ).toEqual([]);
  });
});
