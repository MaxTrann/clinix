import 'reflect-metadata';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Controller, Get, type Type } from '@nestjs/common';
import { HEADERS_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import { MetadataScanner, Reflector } from '@nestjs/core';
import { WRITE_OR_LOCK_SQL } from '../appointments/testing/statement-recorder.js';
import { Roles, ROLES_KEY } from '../auth/decorators/roles.decorator.js';
import {
  listSourceFiles,
  readSource,
  stripComments,
} from '../doctor/testing/architecture-scan.js';
import { ADMIN_SCOPE_KEY } from '../rbac/admin-scope.js';
import { RequireAdminScope } from '../rbac/decorators/require-admin-scope.decorator.js';
import { DashboardModule } from './dashboard.module.js';

// dashboard B1 — DQP-05 (PLAN dashboard 7.1; T4, T12): quét mã nguồn `src/dashboard` (bỏ test và thư mục `testing/`) và metadata của controller.
// Mỗi luật có ĐỐI CHỨNG ÂM (nguồn giả hoặc controller giả vi phạm thì bị bắt) để luật không xanh vì quét sai chỗ.
const DASHBOARD_DIR = fileURLToPath(new URL('.', import.meta.url));

const sources = listSourceFiles(DASHBOARD_DIR).map((file) => ({
  file: relative(DASHBOARD_DIR, file),
  code: stripComments(readSource(file)),
}));

/** Hàm giờ của DB: "hôm nay" phải lấy từ `nowVN()` của ứng dụng (đồng hồ giả được, giờ Việt Nam), không lấy giờ của MySQL. */
const DB_CLOCK =
  /\b(?:NOW|CURDATE|CURTIME|SYSDATE|UTC_TIMESTAMP|UTC_DATE)\s*\(|\bCURRENT_(?:TIMESTAMP|DATE)\b/i;
/** Bọc cột bằng `DATE(...)` làm mất chỉ mục và trái luật AR-05 của booking: lọc bằng khoảng nửa mở. */
const DATE_WRAP = /\bDATE\s*\(/i;

/** Chỗ ngoài `dashboard/` được import (T4): hạ tầng dùng chung, không có service của module khác. */
const ALLOWED_EXTERNAL = [
  /^(\.\.\/)+common\//,
  /^(\.\.\/)+rbac\//,
  /^(\.\.\/)+scheduling\/calendar-date\.js$/,
  /^(\.\.\/)+pricing\/money\.js$/,
  /^(\.\.\/)+auth\/decorators\/roles\.decorator\.js$/,
];
const PACKAGE_IMPORT =
  /^(@nestjs\/|typeorm$|class-validator$|class-transformer$)/;
const IMPORT_FROM = /\bfrom\s+'([^']+)'/g;

/** Đích import vượt ra ngoài `dashboard/` mà không thuộc danh sách cho phép. `file` là đường dẫn tương đối trong `dashboard/`. */
function forbiddenImports(file: string, code: string): string[] {
  const depth = file.split(/[\\/]/).length - 1;
  const leaveDashboard = '../'.repeat(depth + 1);
  return [...code.matchAll(IMPORT_FROM)]
    .map((match) => match[1] ?? '')
    .filter((target) => {
      if (PACKAGE_IMPORT.test(target)) return false;
      if (!target.startsWith(leaveDashboard)) return !target.startsWith('.');
      return !ALLOWED_EXTERNAL.some((rule) => rule.test(target));
    });
}

/** Lỗi bảo vệ của các route trong `controllers`: thiếu `@Roles`, phạm vi khác `'Any'` ở route Quản trị viên, thiếu `no-store`. */
function routeFailures(controllers: readonly Type[]): string[] {
  const reflector = new Reflector();
  const scanner = new MetadataScanner();
  const failures: string[] = [];
  for (const controller of controllers) {
    const prototype = controller.prototype as Record<string, unknown>;
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name];
      if (
        typeof handler !== 'function' ||
        Reflect.getMetadata(METHOD_METADATA, handler) === undefined
      )
        continue;
      const where = `${controller.name}.${name}`;
      const roles = reflector.get<string[] | undefined>(ROLES_KEY, handler);
      if (!roles || roles.length === 0) failures.push(`${where}: thiếu @Roles`);
      if (
        roles?.includes('QuanTriVien') &&
        reflector.get<unknown>(ADMIN_SCOPE_KEY, handler) !== 'Any'
      )
        failures.push(`${where}: thiếu @RequireAdminScope('Any')`);
      const headers =
        (Reflect.getMetadata(HEADERS_METADATA, handler) as
          { name: string; value: string }[] | undefined) ?? [];
      if (
        !headers.some(
          (h) => h.name === 'Cache-Control' && h.value === 'no-store',
        )
      )
        failures.push(`${where}: thiếu no-store`);
    }
  }
  return failures;
}

const moduleControllers = (Reflect.getMetadata(
  'controllers',
  DashboardModule,
) ?? []) as Type[];

describe('dashboard B1 — kiến trúc (DQP-05)', () => {
  it('có mã nguồn và controller để quét (chống quét rỗng)', () => {
    expect(sources.map((s) => s.file)).toContain('dashboard.module.ts');
    expect(sources.length).toBeGreaterThanOrEqual(8);
    expect(moduleControllers.map((c) => c.name)).toContain(
      'AdminDashboardController',
    );
  });

  it('DQP-05: không câu ghi, không mệnh đề khoá; đối chứng âm: nguồn giả có `UPDATE`, `FOR SHARE` thì bị bắt', () => {
    expect(WRITE_OR_LOCK_SQL.test("q('UPDATE lich_hen SET x = 1')")).toBe(true);
    expect(WRITE_OR_LOCK_SQL.test("q('SELECT 1 FROM t FOR SHARE')")).toBe(true);
    expect(
      sources.filter((s) => WRITE_OR_LOCK_SQL.test(s.code)).map((s) => s.file),
    ).toStrictEqual([]);
  });

  it('DQP-05: không đọc giờ của DB, không bọc cột bằng DATE(...); đối chứng âm', () => {
    expect(DB_CLOCK.test("q('WHERE t < NOW()')")).toBe(true);
    expect(DB_CLOCK.test("q('WHERE t < CURRENT_TIMESTAMP')")).toBe(true);
    // Biến `now` của mã TypeScript (lấy từ `nowVN()`) không phải hàm giờ của DB
    expect(DB_CLOCK.test('const now = nowVN();')).toBe(false);
    expect(DATE_WRAP.test("q('WHERE DATE(thoi_gian) = ?')")).toBe(true);
    expect(
      sources
        .filter((s) => DB_CLOCK.test(s.code) || DATE_WRAP.test(s.code))
        .map((s) => s.file),
    ).toStrictEqual([]);
  });

  it('DQP-05 (T4): chỉ import hạ tầng dùng chung (common, rbac, calendar-date, money, Roles), không service của module khác; đối chứng âm', () => {
    expect(
      forbiddenImports(
        'admin/x.ts',
        "import { A } from '../../appointments/lists/admin-appointments.service.js';",
      ),
    ).toHaveLength(1);
    expect(
      forbiddenImports('admin/x.ts', "import { A } from 'lodash';"),
    ).toHaveLength(1);
    expect(
      forbiddenImports(
        'admin/x.ts',
        "import { A } from '../../common/time/time.js'; import { B } from '../filter/y.js';",
      ),
    ).toStrictEqual([]);
    expect(
      sources.flatMap((s) =>
        forbiddenImports(s.file, s.code).map((t) => `${s.file}: ${t}`),
      ),
    ).toStrictEqual([]);
  });

  it("DQP-05 (T12): mọi route có @Roles, route Quản trị viên có @RequireAdminScope('Any') và no-store; đối chứng âm: controller giả thiếu thì bị bắt", () => {
    @Controller('admin/fake')
    class MissingEverything {
      @Get()
      overview() {
        return null;
      }
    }
    @Controller('admin/fake-scope')
    class WrongScope {
      @Get()
      @Roles('QuanTriVien')
      @RequireAdminScope('ToanHeThong')
      overview() {
        return null;
      }
    }
    expect(routeFailures([MissingEverything])).toStrictEqual([
      'MissingEverything.overview: thiếu @Roles',
      'MissingEverything.overview: thiếu no-store',
    ]);
    expect(routeFailures([WrongScope])).toStrictEqual([
      "WrongScope.overview: thiếu @RequireAdminScope('Any')",
      'WrongScope.overview: thiếu no-store',
    ]);
    expect(routeFailures(moduleControllers)).toStrictEqual([]);
  });
});
