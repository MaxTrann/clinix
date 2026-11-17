import 'reflect-metadata';
import { Controller, Get, Post } from '@nestjs/common';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findWriteViolations,
  type SourceFile,
} from '../appointments/testing/architecture-rules.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { PatientWalletController } from '../wallet/balance/patient-wallet.controller.js';
import { PaymentPolicyController } from './policy/payment-policy.controller.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  findForbiddenSql,
  listSourceFiles,
  readSource,
} from '../doctor/testing/architecture-scan.js';
import {
  MAX_PUBLIC_ROUTES,
  PUBLIC_ROUTE_ALLOWLIST,
  findCheckInActorViolations,
  findModuleImportViolations,
  findPaymentRouteViolations,
  findRequestIdentityViolations,
  scopeFiles,
} from './testing/payment-architecture-rules.js';

// payment P4 — QTT-01, QTT-08, QTT-09, QTT-14 và phần quét mã nguồn của QTT-11 (PLAN payment 7.x; E10). Phần cây AppModule của QTT-11 và HDT-11: architecture.int-spec.ts
// (cần biến môi trường test như AR-03 của booking). Quét `src/` thật cho `payment/` và `wallet/`; hàm thuần nên "đột biến" bằng dữ liệu tổng hợp.
const SRC_DIR = fileURLToPath(new URL('..', import.meta.url));
const allFiles: SourceFile[] = listSourceFiles(SRC_DIR).map((file) => ({
  path: relative(SRC_DIR, file).split(sep).join('/'),
  source: readSource(file),
}));
const real = scopeFiles(allFiles);
const file = (path: string, source: string): SourceFile => ({ path, source });

describe('cây src/ thật của payment/ và wallet/', () => {
  it('có file để quét (entity của P1): luật không chạy trên danh sách rỗng', () => {
    expect(real.length).toBeGreaterThan(3);
    expect(real.some((f) => f.path.startsWith('payment/'))).toBe(true);
    expect(real.some((f) => f.path.startsWith('wallet/'))).toBe(true);
  });
});

describe('QTT-08 payment/ và wallet/ không ghi lich_hen, khung_gio và không dùng giờ của DB', () => {
  it('cây thật: không UPDATE lich_hen, UPDATE khung_gio, NOW(), CURDATE() và không câu ghi lich_hen, khung_gio nào (AR-01)', () => {
    expect(real.flatMap((f) => findForbiddenSql(f.source))).toEqual([]);
    expect(findWriteViolations(real)).toEqual([]);
  });

  it.each([
    ['UPDATE lich_hen', "x('UPDATE lich_hen SET trang_thai = ?')"],
    ['UPDATE khung_gio', "x('UPDATE khung_gio SET trang_thai = ?')"],
    ['NOW()', "x('SELECT * FROM giao_dich_thanh_toan WHERE a < NOW()')"],
    ['CURDATE()', "x('SELECT CURDATE()')"],
  ])('đột biến: %s ở payment/ bị bắt', (name, source) => {
    expect(findForbiddenSql(source)).toContain(name);
  });

  it('đột biến: ghi thực thể LichHen ở wallet/ bị bắt bởi AR-01', () => {
    const found = findWriteViolations([
      file('wallet/x.service.ts', 'await manager.update(LichHen, {}, {})'),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('wallet/x.service.ts');
  });

  it('không bắt nhầm: comment và đọc lich_hen', () => {
    expect(
      findForbiddenSql(
        '// không dùng NOW() ở đây\nq("SELECT 1 FROM lich_hen")',
      ),
    ).toEqual([]);
  });
});

describe('QTT-09 mọi checkIn ở payment/ chỉ actor ThanhToan', () => {
  it('cây thật đạt (hiện chưa có lời gọi nào: B6 thêm)', () => {
    expect(findCheckInActorViolations(real)).toEqual([]);
  });

  it('đúng: actor ThanhToan, kể cả khi đối số xuống nhiều dòng và có ngoặc lồng', () => {
    const source = `await this.transitions.checkIn(em, {
      lichHenId: String(id),
      actor: 'ThanhToan',
      now: toSecond(nowVN()),
    });`;
    expect(
      findCheckInActorViolations([file('payment/cash/x.service.ts', source)]),
    ).toEqual([]);
  });

  it.each([
    ['LeTan', "x.checkIn(em, { actor: 'LeTan', lichHenId })"],
    ['QuanTriVien', "x.checkIn(em, { actor: 'QuanTriVien', lichHenId })"],
    ['thiếu actor', 'x.checkIn(em, { lichHenId })'],
    ['actor là biến', 'x.checkIn(em, { actor, lichHenId })'],
    [
      'ThanhToan nằm ngoài đối số của checkIn',
      "x.checkIn(em, { lichHenId }); const actor = 'ThanhToan'",
    ],
  ])('đột biến: %s bị bắt', (_name, source) => {
    const found = findCheckInActorViolations([
      file('payment/cash/x.service.ts', source),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('payment/cash/x.service.ts');
  });

  it('chỉ xét payment/: checkIn của Lễ tân ở appointments/ không bị bắt; comment bị bỏ qua', () => {
    expect(
      findCheckInActorViolations([
        file('appointments/status/x.ts', "t.checkIn(em, { actor: 'LeTan' })"),
        file('payment/x.ts', "// t.checkIn(em, { actor: 'LeTan' })"),
      ]),
    ).toEqual([]);
  });
});

describe('QTT-11 hướng import module (phần quét mã nguồn)', () => {
  it('cây thật đạt', () => {
    expect(findModuleImportViolations(allFiles)).toEqual([]);
  });

  it.each([
    [
      'payment/ports/x.ts',
      "import { AppointmentsModule } from '../../appointments/appointments.module.js';",
    ],
    [
      'payment/ports/x.ts',
      "import { PaymentModule } from '../payment.module.js';",
    ],
    [
      'payment/ports/x.ts',
      "import { WalletModule } from '../../wallet/wallet.module.js';",
    ],
    [
      'wallet/x.ts',
      "import { AppointmentsModule } from '../appointments/appointments.module.js';",
    ],
    [
      'wallet/ledger/x.ts',
      "import { PaymentModule } from '../../payment/payment.module.js';",
    ],
  ])('đột biến: %s nhập ngược bị bắt', (path, source) => {
    const found = findModuleImportViolations([file(path, source)]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(path);
  });

  it('đột biến: forwardRef ở bất kỳ file nào của scope bị bắt (HDT-11)', () => {
    expect(
      findModuleImportViolations([
        file(
          'payment/payment.module.ts',
          'imports: [forwardRef(() => WalletModule)]',
        ),
      ]),
    ).toHaveLength(1);
  });

  it('không bắt nhầm: wallet/ nhập hàm thuần của appointments/locking (M16), nhập PaymentPortsModule; payment/ nhập module của chính nó', () => {
    expect(
      findModuleImportViolations([
        file(
          'wallet/x.ts',
          "import { withBookingTransaction } from '../appointments/locking/booking-transaction.js';\nimport { PaymentPortsModule } from '../payment/ports/payment-ports.module.js';",
        ),
        file(
          'payment/payment.module.ts',
          "import { AppointmentsModule } from '../appointments/appointments.module.js';",
        ),
      ]),
    ).toEqual([]);
  });
});

describe('QTT-14 nguoi_thu_id và nguoi_xu_ly_id chỉ lấy từ token', () => {
  it('cây thật đạt', () => {
    expect(findRequestIdentityViolations(real)).toEqual([]);
  });

  it.each([
    ['payment/cash/collect-cash.dto.ts', 'nguoiThuId!: string;'],
    ['wallet/admin/credit.dto.ts', 'nguoiXuLyId?: string;'],
    ['payment/cash/x.dto.ts', 'nguoi_thu_id: string;'],
    ['payment/x.controller.ts', "collect(@Body('nguoiThuId') id: string) {}"],
    ['wallet/x.controller.ts', 'f(@Query("nguoi_xu_ly_id") id: string) {}'],
  ])('đột biến: %s bị bắt', (path, source) => {
    const found = findRequestIdentityViolations([file(path, source)]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(path);
  });

  it('không bắt nhầm: lấy id người đăng nhập từ token, và tên trong comment', () => {
    expect(
      findRequestIdentityViolations([
        file(
          'payment/cash/x.controller.ts',
          '// nguoiThuId lấy từ token\nconst nguoiThuId = user.taiKhoanId;',
        ),
        file('payment/cash/x.dto.ts', 'soTien!: string;'),
      ]),
    ).toEqual([]);
  });
});

describe('QTT-01 mọi route có @Roles hợp lệ; @Public chỉ ở route IPN trong danh sách', () => {
  it('controller THẬT của ví (B1): mọi route có @Roles hợp lệ, không @Public', () => {
    expect(findPaymentRouteViolations([PatientWalletController])).toEqual([]);
  });

  it('controller THẬT của cấu hình chính sách cọc (B10, CSD-14): mọi route có @Roles hợp lệ, không @Public', () => {
    expect(findPaymentRouteViolations([PaymentPolicyController])).toEqual([]);
  });

  it('danh sách @Public cho phép không vượt trần hai route IPN', () => {
    expect(PUBLIC_ROUTE_ALLOWLIST.length).toBeLessThanOrEqual(
      MAX_PUBLIC_ROUTES,
    );
  });

  it('đúng: route có @Roles hợp lệ; route @Public nằm trong danh sách cho phép', () => {
    @Controller('x')
    class Good {
      @Roles('BenhNhan')
      @Get()
      list() {}
      @Public()
      @Post('ipn')
      ipn() {}
    }
    expect(findPaymentRouteViolations([Good], ['Good.ipn'])).toEqual([]);
  });

  it('đột biến: thiếu @Roles, @Roles rỗng, vai trò lạ bị bắt', () => {
    @Controller('x')
    class Bad {
      @Get()
      noRoles() {}
      @Roles()
      @Get('a')
      emptyRoles() {}
      @Roles('NguoiLa' as never)
      @Get('b')
      unknownRole() {}
    }
    expect(findPaymentRouteViolations([Bad])).toEqual([
      'Bad.noRoles: thiếu @Roles (hoặc rỗng)',
      'Bad.emptyRoles: thiếu @Roles (hoặc rỗng)',
      'Bad.unknownRole: @Roles có vai trò không thuộc LOAI_TAI_KHOAN',
    ]);
  });

  it('đột biến: @Public ngoài danh sách bị bắt; quá hai route @Public bị bắt', () => {
    @Controller('x')
    class Open {
      @Public()
      @Post('a')
      a() {}
      @Public()
      @Post('b')
      b() {}
      @Public()
      @Post('c')
      c() {}
    }
    const found = findPaymentRouteViolations([Open], ['Open.a', 'Open.b']);
    expect(found).toContain(
      'Open.c: có @Public nhưng không thuộc PUBLIC_ROUTE_ALLOWLIST',
    );
    expect(found.some((line) => line.includes('tối đa 2'))).toBe(true);
  });

  it('@Roles ở class có hiệu lực cho mọi route của class (cùng cách RolesGuard)', () => {
    @Roles('QuanTriVien')
    @Controller('x')
    class ClassLevel {
      @Get()
      a() {}
    }
    expect(findPaymentRouteViolations([ClassLevel])).toEqual([]);
  });
});
