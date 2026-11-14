import 'reflect-metadata';
import { Controller, Get, Post, SetMetadata, type Type } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants.js';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findRouteRoleViolations,
  type SourceFile,
} from '../../appointments/testing/architecture-rules.js';
import { Public } from '../../auth/decorators/public.decorator.js';
import { ROLES_KEY, Roles } from '../../auth/decorators/roles.decorator.js';
import {
  listSourceFiles,
  readSource,
  stripComments,
} from '../testing/architecture-scan.js';
import { ExaminationModule } from './examination.module.js';

// doctor-exam P3 (#393) — QHK-09: bộ quét @Roles trên doctor/examination/ (PLAN 7.7; mẫu AR-02 của booking, QP-08 của patient).
// Hai lớp, vì AR-02 và QP-08 KHÔNG đọc fs: chúng đọc metadata Nest của controller đã đăng ký trong một module, nên bỏ sót controller nằm trong examination/ mà đăng ký nhầm module.
//  (1) metadata của ExaminationModule qua `findRouteRoleViolations` (từng route có @Roles hợp lệ, không @Public; @Roles ở class thay cho method như RolesGuard);
//  (2) quét fs: mọi lớp có @Controller trong mã của doctor/examination/ phải nằm trong `controllers` của ExaminationModule (nếu không, lớp (1) không thấy nó).
// P3 chưa có controller nào nên cả hai lớp rỗng và đạt vì rỗng; B1 trở đi tự bị quét. Chống đạt giả: các ca đột biến bên dưới.
const SRC_DIR = fileURLToPath(new URL('../..', import.meta.url));
const EXAM_DIR = fileURLToPath(new URL('.', import.meta.url));

const registeredControllers = () =>
  (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ExaminationModule) ??
    []) as Type<unknown>[];

const examFiles = (): SourceFile[] =>
  listSourceFiles(EXAM_DIR).map((full) => ({
    path: relative(SRC_DIR, full).split(sep).join('/'),
    source: readSource(full),
  }));

/** Lớp (2): mỗi `export class` trong file có `@Controller(` mà chưa có trong `registered` (so theo tên lớp). Trả danh sách thông điệp, rỗng = đạt. */
function findUnregisteredControllers(
  files: readonly SourceFile[],
  registered: readonly { name: string }[],
): string[] {
  const known = registered.map((controller) => controller.name);
  return files.flatMap(({ path, source }) => {
    const code = stripComments(source);
    if (!/@Controller\s*\(/.test(code)) return [];
    return [...code.matchAll(/export\s+class\s+(\w+)/g)]
      .map((match) => match[1] ?? '')
      .filter((name) => !known.includes(name))
      .map(
        (name) =>
          `${path}: ${name} có @Controller nhưng chưa nằm trong controllers của ExaminationModule`,
      );
  });
}

// Controller giả, mỗi lớp một kiểu vi phạm (đột biến): quét thật của AR-02 đã có ở appointments/architecture.spec.ts; ở đây chứng minh lớp (1) NỐI đúng cho thư mục này.
@Controller('x')
class MissingRoles {
  @Get() list() {}
}
@Controller('x')
class EmptyRoles {
  @Get() @SetMetadata(ROLES_KEY, []) list() {}
}
@Controller('x')
class PublicRoute {
  @Get() @Roles('BacSi') @Public() list() {}
}
@Controller('x')
class UnknownRole {
  @Get() @SetMetadata(ROLES_KEY, ['Khach']) list() {}
}
@Controller('x')
class OneBad {
  @Get() @Roles('BacSi') good() {}
  @Post() bad() {}
}
@Controller('x')
@Roles('BenhNhan')
class ClassLevel {
  @Get() list() {}
  @Post() create() {}
}

describe('QHK-09 mọi route của doctor/examination/ có @Roles, không @Public (lớp 1: metadata của ExaminationModule)', () => {
  it('ExaminationModule thật: không route nào thiếu @Roles hay có @Public (P3: chưa có controller nào, đạt vì rỗng)', () => {
    expect(findRouteRoleViolations(registeredControllers())).toEqual([]);
  });

  it.each([
    [
      'thiếu @Roles',
      MissingRoles,
      'MissingRoles.list: thiếu @Roles (hoặc rỗng)',
    ],
    ['@Roles rỗng', EmptyRoles, 'EmptyRoles.list: thiếu @Roles (hoặc rỗng)'],
    ['@Public', PublicRoute, 'PublicRoute.list: có @Public'],
    [
      'vai trò lạ',
      UnknownRole,
      'UnknownRole.list: @Roles có vai trò không thuộc LOAI_TAI_KHOAN',
    ],
    [
      'một route trong hai thiếu',
      OneBad,
      'OneBad.bad: thiếu @Roles (hoặc rỗng)',
    ],
  ])(
    'đột biến: controller %s bị bắt, thông điệp có TênController.tênHàm',
    (_name, controller, message) => {
      expect(findRouteRoleViolations([controller])).toEqual([message]);
    },
  );

  it('không bắt nhầm: @Roles ở class đủ cho mọi route', () => {
    expect(findRouteRoleViolations([ClassLevel])).toEqual([]);
  });
});

describe('QHK-09 lớp 2: controller trong doctor/examination/ phải đăng ký ở ExaminationModule', () => {
  const controllerFile = (path: string, source: string): SourceFile => ({
    path,
    source,
  });
  const declared = (name: string) =>
    `@Controller('doctor/x')\n@Roles('BacSi')\nexport class ${name} {}`;

  it('mã thật của thư mục: mọi lớp @Controller đã nằm trong controllers của ExaminationModule (P3: chưa có controller nào)', () => {
    expect(
      findUnregisteredControllers(examFiles(), registeredControllers()),
    ).toEqual([]);
  });

  it('đột biến: lớp có @Controller mà chưa đăng ký bị bắt, thông điệp nêu file và tên lớp', () => {
    const found = findUnregisteredControllers(
      [
        controllerFile(
          'doctor/examination/completion/exam-completion.controller.ts',
          declared('ExamCompletionController'),
        ),
      ],
      [],
    );
    expect(found).toEqual([
      'doctor/examination/completion/exam-completion.controller.ts: ExamCompletionController có @Controller nhưng chưa nằm trong controllers của ExaminationModule',
    ]);
  });

  it('đột biến: file KHÔNG đặt tên *.controller.ts mà có @Controller cũng bị bắt (quét theo nội dung, không theo tên file); hai lớp trong một file, một lớp chưa đăng ký ⇒ một thông điệp', () => {
    const found = findUnregisteredControllers(
      [
        controllerFile('doctor/examination/rating/khac.ts', declared('Lac')),
        controllerFile(
          'doctor/examination/rating/two.controller.ts',
          `${declared('A')}\n${declared('B')}`,
        ),
      ],
      [{ name: 'A' }],
    );
    expect(found).toHaveLength(2);
    expect(found[0]).toContain('Lac');
    expect(found[1]).toContain('two.controller.ts: B ');
  });

  it('không bắt nhầm: lớp đã đăng ký, file không có @Controller (service, dto), và @Controller nằm trong comment', () => {
    expect(
      findUnregisteredControllers(
        [
          controllerFile('doctor/examination/a.controller.ts', declared('A')),
          controllerFile(
            'doctor/examination/b.service.ts',
            'export class BService {}',
          ),
          controllerFile(
            'doctor/examination/c.ts',
            "// @Controller('x') đã bỏ\nexport class C {}",
          ),
        ],
        [{ name: 'A' }],
      ),
    ).toEqual([]);
  });
});
