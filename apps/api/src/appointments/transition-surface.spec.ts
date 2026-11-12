import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants.js';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  listSourceFiles,
  readSource,
} from '../doctor/testing/architecture-scan.js';
import { AppointmentsModule } from './appointments.module.js';
import { AppointmentQueries } from './queries/appointment-queries.js';
import { AppointmentTransitionService } from './state/appointment-transition.service.js';
import type { SourceFile } from './testing/architecture-rules.js';
import {
  ALLOWED_OUTSIDE_METHODS,
  findTransitionSurfaceViolations,
  publicMethodsOf,
} from './testing/transition-surface-rules.js';

// Task B11 — AR-07 (PLAN booking 7.30; TRACKING 3.24.1): bề mặt gọi vào của `AppointmentsModule`. Ngoài `appointments/` chỉ được gọi `confirmPaid` và `complete` của `AppointmentTransitionService`; huỷ phải qua
// `AppointmentCancellationService` (B10). Luật ở testing/transition-surface-rules.ts (hàm thuần, thử bằng dữ liệu tổng hợp); ở đây nạp cây `src/` thật.
const SRC_DIR = fileURLToPath(new URL('..', import.meta.url));
const files: SourceFile[] = listSourceFiles(SRC_DIR).map((file) => ({
  path: relative(SRC_DIR, file).split(sep).join('/'),
  source: readSource(file),
}));
const serviceSource =
  files.find(
    (file) =>
      file.path === 'appointments/state/appointment-transition.service.ts',
  )?.source ?? '';
const methods = publicMethodsOf(serviceSource);
const file = (path: string, source: string): SourceFile => ({ path, source });

describe('AR-07 phương thức công khai của AppointmentTransitionService (đọc từ nguồn)', () => {
  it('thấy đủ phương thức công khai hiện có và KHÔNG thấy phương thức private, constructor (nếu bộ đọc hỏng thì luật bên dưới vô nghĩa)', () => {
    expect(methods).toEqual(
      expect.arrayContaining(['expire', 'confirmPaid', 'complete']),
    );
    for (const name of [
      'constructor',
      'expireWithin',
      'notifyWaitlist',
      'logger',
    ])
      expect(methods).not.toContain(name);
  });

  it('hai tên được phép đều là phương thức công khai thật', () => {
    for (const name of ALLOWED_OUTSIDE_METHODS) expect(methods).toContain(name);
  });
});

describe('AR-07 ngoài appointments/ chỉ gọi confirmPaid và complete', () => {
  it('cây src/ thật: không file nào ngoài appointments/ gọi phương thức khác của AppointmentTransitionService', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(findTransitionSurfaceViolations(files, methods)).toEqual([]);
  });

  it.each(['expire', 'cancel', 'checkIn', 'markNoShow'])(
    'đột biến: file của module lạ gọi .%s() của AppointmentTransitionService bị bắt (kể cả phương thức B10, B12 sắp thêm)',
    (method) => {
      const source = `import { AppointmentTransitionService } from '../appointments/state/appointment-transition.service.js';
class X { constructor(private readonly t: AppointmentTransitionService) {} run() { return this.t.${method}({}); } }`;
      const found = findTransitionSurfaceViolations(
        [file('payment/x.service.ts', source)],
        [...methods, 'cancel', 'checkIn', 'markNoShow'],
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toContain('payment/x.service.ts');
      expect(found[0]).toContain(`.${method}()`);
      expect(found[0]).toContain('AppointmentCancellationService');
    },
  );

  it('không bắt nhầm: gọi confirmPaid và complete; file không nhắc AppointmentTransitionService; comment; file trong appointments/', () => {
    const call = (method: string) =>
      `import { AppointmentTransitionService } from 'x';\nthis.t.${method}(em, {});`;
    const clean = [
      file('payment/a.ts', call('confirmPaid')),
      file('doctor/b.ts', call('complete')),
      file(
        'doctor/c.ts',
        'this.runner.expire({}); this.cancellation.cancel({});',
      ),
      file(
        'doctor/d.ts',
        '// AppointmentTransitionService.expire() không gọi ở đây\nconst a = 1;',
      ),
      file('appointments/e.ts', call('expire')),
    ];
    expect(findTransitionSurfaceViolations(clean, methods)).toEqual([]);
  });
});

describe('AR-07 AppointmentsModule xuất bề mặt gọi vào', () => {
  it('exports có AppointmentTransitionService (payment gọi confirmPaid, doctor gọi complete) và AppointmentQueries (doctor gọi ba hàm đọc); module sau này (B10 xuất AppointmentCancellationService…) được thêm, không bớt hai tên này', () => {
    const exported: unknown = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      AppointmentsModule,
    );
    expect(exported).toEqual(
      expect.arrayContaining([
        AppointmentTransitionService,
        AppointmentQueries,
      ]),
    );
  });
});
