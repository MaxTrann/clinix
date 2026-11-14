import { forwardRef, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { DoctorModule } from './doctor.module.js';
import {
  findForbiddenSql,
  listSourceFiles,
  readSource,
  stripComments,
  walkModuleTree,
} from './testing/architecture-scan.js';

// Doctor P5 — test kiến trúc: HD-01 (cây import), HD-08 (quét mã). HD-10 (đúng một ScheduleModule) cần cây của AppModule
// nên nằm ở architecture.int-spec.ts (có biến môi trường test).
const DOCTOR_DIR = fileURLToPath(new URL('.', import.meta.url));
const SCHEDULING_DIR = join(DOCTOR_DIR, '..', 'scheduling');
const names = (modules: Iterable<{ name: string }>) =>
  [...modules].map((m) => m.name);

describe('HD-01 cây import', () => {
  it('SchedulingModule không (kể cả gián tiếp) import AppointmentsModule hay DoctorModule, và không có chu trình (H20)', async () => {
    const tree = await walkModuleTree(SchedulingModule);
    expect(tree.cycle).toBeNull();
    expect(names(tree.references.keys())).not.toContain('AppointmentsModule');
    expect(names(tree.references.keys())).not.toContain('DoctorModule');
  });

  it('DoctorModule import SchedulingModule, RbacModule, AuditModule; cây không có chu trình', async () => {
    const tree = await walkModuleTree(DoctorModule);
    expect(tree.cycle).toBeNull();
    for (const module of [SchedulingModule, RbacModule, AuditModule])
      expect(tree.references.has(module), module.name).toBe(true);
  });

  it('mã trong scheduling/ không import appointments/ hay doctor/ (chiều phụ thuộc chỉ đi một hướng)', () => {
    const files = listSourceFiles(SCHEDULING_DIR);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const imports = [
        ...stripComments(readSource(file)).matchAll(/from\s+'([^']+)'/g),
      ].map((match) => match[1] as string);
      expect(
        imports.filter((path) => /(^|\/)(appointments|doctor)\//.test(path)),
        file,
      ).toEqual([]);
    }
  });
});

describe('HD-08 quét mã doctor/ và scheduling/', () => {
  it('không có UPDATE lich_hen, UPDATE khung_gio, NOW(), CURDATE() (H6, H8): ghi giờ bằng đồng hồ ứng dụng, chỉ booking đổi lịch hẹn/khung giờ', () => {
    const files = [
      ...listSourceFiles(DOCTOR_DIR),
      ...listSourceFiles(SCHEDULING_DIR),
    ];
    expect(files.length).toBeGreaterThan(5);
    const found = files.flatMap((file) =>
      findForbiddenSql(readSource(file)).map((name) => `${file}: ${name}`),
    );
    expect(found).toEqual([]);
  });

  it('bộ quét thật sự bắt được (ca đột biến): từng mẫu cấm bị phát hiện, comment thì bỏ qua', () => {
    expect(findForbiddenSql("db.query('UPDATE lich_hen SET x = 1')")).toEqual([
      'UPDATE lich_hen',
    ]);
    expect(findForbiddenSql('`UPDATE `khung_gio` SET a = 1`')).toEqual([
      'UPDATE khung_gio',
    ]);
    expect(findForbiddenSql('SELECT NOW(), CURDATE()')).toEqual([
      'NOW()',
      'CURDATE()',
    ]);
    expect(findForbiddenSql('// không dùng NOW() hay CURDATE()')).toEqual([]);
    expect(findForbiddenSql('/* UPDATE lich_hen */ const a = 1;')).toEqual([]);
    // bảng khác có tiền tố giống nhau thì không bị bắt nhầm
    expect(findForbiddenSql('UPDATE lich_hen_cho SET a = 1')).toEqual([]);
  });
});

// E8 (doctor-exam P3, HDK-04): đúng MỘT file của doctor/ được nhắc AppointmentTransitionService, để gọi `complete` (booking D6; task B1 viết file này). Đường dẫn tính từ doctor/.
const ALLOWED_TRANSITION_FILES = [
  'examination/completion/exam-completion.service.ts',
];

/** Đường dẫn các file vi phạm PD-19. File trong `allowed` chỉ được bỏ riêng token AppointmentTransitionService; RefundPort, WaitlistPort… vẫn cấm ở chính file đó. */
function pd19Violations(
  files: readonly { path: string; source: string }[],
  allowed: readonly string[] = ALLOWED_TRANSITION_FILES,
): string[] {
  const forbidden =
    /\b(RefundPort|REFUND_PORT|WaitlistPort|WAITLIST_PORT|AppointmentTransitionService)\b/;
  return files
    .filter(({ path, source }) => {
      const code = stripComments(source);
      return forbidden.test(
        allowed.includes(path)
          ? code.replace(/\bAppointmentTransitionService\b/g, '')
          : code,
      );
    })
    .map(({ path }) => path);
}

describe('PD-19 Duyệt chỉ huỷ lịch qua cancel của booking (H6)', () => {
  it('mã doctor/ không dùng RefundPort, WaitlistPort hay AppointmentTransitionService (trừ đúng một file ngoại lệ của E8): hoàn tiền, mời chờ, đổi trạng thái lịch đều nằm trong cancel của booking', () => {
    const files = listSourceFiles(DOCTOR_DIR).map((file) => ({
      path: relative(DOCTOR_DIR, file).split(sep).join('/'),
      source: readSource(file),
    }));
    expect(files.length).toBeGreaterThan(5);
    expect(pd19Violations(files)).toEqual([]);
  });

  it('E8, HDK-04: ngoại lệ là đúng MỘT file examination/completion/exam-completion.service.ts (thêm phần tử hay gõ sai đường dẫn là đỏ)', () => {
    expect(ALLOWED_TRANSITION_FILES).toEqual([
      'examination/completion/exam-completion.service.ts',
    ]);
  });

  it('E8, HDK-04 (đột biến tổng hợp): đặt AppointmentTransitionService ở file khác của doctor/ bị bắt; đúng file ngoại lệ thì sạch; tên file gần giống vẫn bị bắt', () => {
    const named = "import { AppointmentTransitionService } from 'x';";
    const [exception] = ALLOWED_TRANSITION_FILES as [string];
    expect(pd19Violations([{ path: exception, source: named }])).toEqual([]);
    for (const path of [
      'examination/exam-record/exam-record.service.ts',
      'examination/completion/other.service.ts',
      'examination/completion/exam-completion.service.tsx',
      'examination/exam-completion.service.ts',
      'leave-approval/booking-cancellation.adapter.ts',
    ])
      expect(pd19Violations([{ path, source: named }]), path).toEqual([path]);
  });

  it('E8 (đột biến tổng hợp): file ngoại lệ chỉ được nhắc AppointmentTransitionService, RefundPort và WaitlistPort vẫn cấm ở chính file đó; comment thì bỏ qua', () => {
    const [exception] = ALLOWED_TRANSITION_FILES as [string];
    for (const token of ['RefundPort', 'REFUND_PORT', 'WaitlistPort'])
      expect(
        pd19Violations([
          {
            path: exception,
            source: `class A { constructor(a: AppointmentTransitionService, b: ${token}) {} }`,
          },
        ]),
        token,
      ).toEqual([exception]);
    expect(
      pd19Violations([
        {
          path: 'shifts/x.ts',
          source: '// không dùng AppointmentTransitionService ở đây',
        },
      ]),
    ).toEqual([]);
  });

  it('DoctorModule import AppointmentsModule (một chiều doctor → appointments), cây vẫn không có chu trình', async () => {
    const { AppointmentsModule } =
      await import('../appointments/appointments.module.js');
    const tree = await walkModuleTree(DoctorModule);
    expect(tree.cycle).toBeNull();
    expect(tree.references.has(AppointmentsModule)).toBe(true);
    const fromAppointments = await walkModuleTree(AppointmentsModule);
    expect(names(fromAppointments.references.keys())).not.toContain(
      'DoctorModule',
    );
  });
});

describe('bộ duyệt cây import thật sự bắt được lỗi (ca đột biến)', () => {
  it('phát hiện chu trình giữa hai module', async () => {
    @Module({ imports: [forwardRef(() => ModuleB)] })
    class ModuleA {}
    @Module({ imports: [forwardRef(() => ModuleA)] })
    class ModuleB {}
    const tree = await walkModuleTree(ModuleA);
    expect(tree.cycle?.map((m) => m.name)).toEqual([
      'ModuleA',
      'ModuleB',
      'ModuleA',
    ]);
  });

  it('đếm đúng số lần ScheduleModule được đăng ký, kể cả dạng dynamic module và bất đồng bộ', async () => {
    @Module({
      imports: [
        { module: ScheduleModule },
        Promise.resolve({ module: ScheduleModule }),
      ],
    })
    class Root {}
    const tree = await walkModuleTree(Root);
    expect(tree.references.get(ScheduleModule)).toBe(2);
  });
});
