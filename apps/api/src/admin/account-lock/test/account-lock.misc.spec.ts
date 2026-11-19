import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { EntityManager } from 'typeorm';
import { AuditModule } from '../../../audit/audit.module.js';
import { AuthModule } from '../../../auth/auth.module.js';
import { ROLES_KEY } from '../../../auth/decorators/roles.decorator.js';
import { findSecretLeaks } from '../../accounts/testing/secret-leak.js';
import { AppException } from '../../../common/errors/app.exception.js';
import {
  ERROR_CODE_PATTERN,
  defaultsForStatus,
} from '../../../common/errors/error-codes.js';
import { ADMIN_SCOPE_KEY } from '../../../rbac/admin-scope.js';
import { RbacModule } from '../../../rbac/rbac.module.js';
import { AccountIdDto } from '../../accounts/account.dto.js';
import { AccountLockController } from '../account-lock.controller.js';
import {
  ACCOUNT_LOCK_ERROR_CODES,
  awaitingActivationError,
  forbiddenError,
  lastSystemAdminError,
  notFoundError,
  selfLockError,
  stateNotAllowedError,
} from '../account-lock.errors.js';
import { AccountLockModule } from '../account-lock.module.js';
import {
  AccountLockRepository,
  DEPENDENTS_LIMIT,
} from '../account-lock.repository.js';
import { AccountLockService } from '../account-lock.service.js';

describe('TKB18-04 (TK-23, PQ-11) — controller: đúng hai POST, 200, quyền và phạm vi', () => {
  const proto = AccountLockController.prototype as unknown as Record<
    string,
    () => unknown
  >;
  const routes = Object.getOwnPropertyNames(proto).filter(
    (name) => name !== 'constructor',
  );

  it('chỉ có lock và unlock, cả hai POST, đúng đường dẫn, trả 200', () => {
    expect(routes.sort()).toEqual(['lock', 'unlock']);
    const describeRoute = (name: string) => ({
      method: Reflect.getMetadata(METHOD_METADATA, proto[name]!) as number,
      path: Reflect.getMetadata(PATH_METADATA, proto[name]!) as string,
      status: Reflect.getMetadata('__httpCode__', proto[name]!) as number,
    });
    expect(describeRoute('lock')).toEqual({
      method: RequestMethod.POST,
      path: ':id/lock',
      status: 200,
    });
    expect(describeRoute('unlock')).toEqual({
      method: RequestMethod.POST,
      path: ':id/unlock',
      status: 200,
    });
    expect(Reflect.getMetadata(PATH_METADATA, AccountLockController)).toBe(
      'admin/accounts',
    );
  });

  it('cả controller chỉ cho QuanTriVien và đòi phạm vi Any', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AccountLockController)).toEqual([
      'QuanTriVien',
    ]);
    expect(Reflect.getMetadata(ADMIN_SCOPE_KEY, AccountLockController)).toBe(
      'Any',
    );
  });

  it('không có tham số thân (body): dữ liệu gửi thêm không đi vào service', () => {
    for (const name of ['lock', 'unlock']) {
      const args = Reflect.getMetadata(
        '__routeArguments__',
        AccountLockController,
        name,
      ) as Record<string, { data?: unknown }> | undefined;
      // Kiểu tham số route của Nest: 3 = BODY.
      const kinds = Object.keys(args ?? {}).map((key) => key.split(':')[0]);
      expect(kinds, name).not.toContain('3');
    }
  });

  it('id dùng DTO của B17: đúng dạng bigint được nhận, sai dạng bị từ chối với mã MA_TAI_KHOAN_KHONG_HOP_LE', async () => {
    const check = async (id: unknown) => {
      const errors = await validate(plainToInstance(AccountIdDto, { id }));
      return errors.flatMap((error) => Object.values(error.constraints ?? {}));
    };
    expect(await check('1')).toEqual([]);
    expect(await check('9223372036854775807')).toEqual([]);
    for (const bad of [
      '0',
      '-1',
      'abc',
      '01',
      '9223372036854775808',
      ' 1',
      '1e3',
    ])
      expect(await check(bad), bad).toEqual(['MA_TAI_KHOAN_KHONG_HOP_LE']);
  });
});

describe('TKB18-06 (TK-16, 17, 20, 21) — bốn mã lỗi 409 đúng câu chữ PLAN 5.9', () => {
  const cases: [() => AppException, string, string][] = [
    [
      selfLockError,
      'TU_KHOA_TAI_KHOAN',
      'Không thể tự khoá tài khoản của chính mình.',
    ],
    [
      lastSystemAdminError,
      'CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG',
      'Phải còn ít nhất một Quản trị viên Toàn hệ thống đang hoạt động.',
    ],
    [
      awaitingActivationError,
      'TAI_KHOAN_CHO_KICH_HOAT',
      'Tài khoản đang chờ kích hoạt. Hãy dùng "Gửi lại liên kết kích hoạt".',
    ],
    [
      stateNotAllowedError,
      'TRANG_THAI_KHONG_PHU_HOP',
      'Trạng thái hiện tại của tài khoản không cho phép thao tác này.',
    ],
  ];

  for (const [make, code, message] of cases) {
    it(`${code} ⇒ 409, mã và thông báo nguyên văn`, () => {
      const error = make();
      expect(error).toBeInstanceOf(AppException);
      expect(error.getStatus()).toBe(409);
      expect(error.maLoi).toBe(code);
      expect(code).toMatch(ERROR_CODE_PATTERN);
      expect(error.getResponse()).toEqual({ maLoi: code, thongBao: message });
    });
  }

  it('bốn mã khác nhau và đủ bốn', () => {
    expect(Object.values(ACCOUNT_LOCK_ERROR_CODES).sort()).toEqual(
      cases.map(([, code]) => code).sort(),
    );
  });

  it('404 và 403 là mã và câu mặc định chung của dự án (cùng thân với id không tồn tại)', () => {
    expect(notFoundError().getResponse()).toEqual({
      maLoi: 'KHONG_TIM_THAY',
      thongBao: defaultsForStatus(404).thongBao,
    });
    expect(forbiddenError().getResponse()).toEqual({
      maLoi: 'KHONG_DU_QUYEN',
      thongBao: defaultsForStatus(403).thongBao,
    });
  });
});

describe('TKB18-05 (Q28, SE-A12) — danh sách việc phụ thuộc Bác sĩ: câu lệnh và hình dạng (manager giả)', () => {
  function fakeManager(answers: {
    appointments: unknown[];
    appointmentCount: number;
    shifts: unknown[];
    shiftCount: number;
  }) {
    const queries: { sql: string; params: unknown[] }[] = [];
    const query = vi.fn((sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      if (/COUNT\(\*\)/.test(sql) && /lich_hen/.test(sql))
        return Promise.resolve([{ tong: String(answers.appointmentCount) }]);
      if (/COUNT\(\*\)/.test(sql))
        return Promise.resolve([{ tong: String(answers.shiftCount) }]);
      if (/FROM lich_hen/.test(sql))
        return Promise.resolve(answers.appointments);
      return Promise.resolve(answers.shifts);
    });
    return { manager: { query } as unknown as EntityManager, queries };
  }
  const repository = new AccountLockRepository({} as never);

  it('lịch hẹn: chỉ ba trạng thái hoạt động, theo bác sĩ, LIMIT 50, không cột nào của bệnh nhân', async () => {
    const { manager, queries } = fakeManager({
      appointments: [],
      appointmentCount: 0,
      shifts: [],
      shiftCount: 0,
    });
    await repository.readDependents(manager, '42', '2026-11-20');
    const list = queries.find(
      (q) => /FROM lich_hen/.test(q.sql) && !/COUNT/.test(q.sql),
    )!;
    expect(list.params).toEqual(['42']);
    expect(list.sql).toContain(
      "trang_thai IN ('ChoThanhToan','DaXacNhan','DaTiepDon')",
    );
    for (const excluded of ['HoanThanh', 'DaHuy', 'DaDoiLich', 'VangMat'])
      expect(list.sql).not.toContain(excluded);
    expect(list.sql).toContain(`LIMIT ${String(DEPENDENTS_LIMIT)}`);
    expect(DEPENDENTS_LIMIT).toBe(50);
    expect(list.sql).toContain('bac_si_id = ?');
    for (const forbidden of [
      'ho_ten',
      'email',
      'so_dien_thoai',
      'benh_nhan_id',
      'ho_so_nguoi_than',
    ])
      expect(list.sql).not.toContain(forbidden);
  });

  it('ca làm việc: từ hôm nay trở đi (>=), theo bác sĩ, LIMIT 50; đếm cùng điều kiện', async () => {
    const { manager, queries } = fakeManager({
      appointments: [],
      appointmentCount: 0,
      shifts: [],
      shiftCount: 0,
    });
    await repository.readDependents(manager, '42', '2026-11-20');
    const shifts = queries.filter((q) => /FROM lich_lam_viec/.test(q.sql));
    expect(shifts).toHaveLength(2);
    for (const q of shifts) {
      expect(q.params).toEqual(['42', '2026-11-20']);
      expect(q.sql).toContain('ngay >= ?');
      expect(q.sql).not.toContain('ngay > ?');
    }
    const counts = queries.filter((q) => /COUNT\(\*\)/.test(q.sql));
    expect(counts).toHaveLength(2);
    expect(counts.find((q) => /lich_hen/.test(q.sql))!.sql).toContain(
      "trang_thai IN ('ChoThanhToan','DaXacNhan','DaTiepDon')",
    );
  });

  it('tổng là SỐ thật (không bị cắt ở 50), mục giữ nguyên thứ tự; không có khoá bí mật nào', async () => {
    const appointments = Array.from({ length: 3 }, (_, index) => ({
      lichHenId: String(index + 1),
      maLichHen: `LH-${String(index + 1)}`,
      thoiGian: '2026-11-25 08:00:00',
      trangThai: 'DaXacNhan',
    }));
    const shifts = [
      { lichLamViecId: '9', chiNhanhId: '7', ngay: '2026-11-25', ca: 'CaSang' },
    ];
    const { manager } = fakeManager({
      appointments,
      appointmentCount: 51,
      shifts,
      shiftCount: 1,
    });
    const result = await repository.readDependents(manager, '42', '2026-11-20');
    expect(result.lichHen.tong).toBe(51);
    expect(typeof result.lichHen.tong).toBe('number');
    expect(result.lichHen.muc).toEqual(appointments);
    expect(result.caLamViec).toEqual({ tong: 1, muc: shifts });
    expect(Object.keys(result).sort()).toEqual(['caLamViec', 'lichHen']);
    expect(findSecretLeaks(result)).toEqual([]);
  });

  it('bộ quét bí mật bắt được khoá và giá trị giả (chứng minh phép kiểm có hiệu lực)', () => {
    expect(findSecretLeaks({ matKhauBam: 'x' })).not.toEqual([]);
    expect(
      findSecretLeaks({ muc: [{ ghiChu: '$argon2id$v=19$giả' }] }),
    ).not.toEqual([]);
    expect(
      findSecretLeaks({ muc: [{ ghiChu: 'MOIGIA' }] }, ['MOIGIA']),
    ).not.toEqual([]);
  });
});

describe('TKB18-08 — module: import đúng ba module, không xuất gì', () => {
  it('imports, controllers, providers và exports', () => {
    expect(Reflect.getMetadata('imports', AccountLockModule)).toEqual([
      RbacModule,
      AuditModule,
      AuthModule,
    ]);
    expect(Reflect.getMetadata('controllers', AccountLockModule)).toEqual([
      AccountLockController,
    ]);
    expect(Reflect.getMetadata('providers', AccountLockModule)).toEqual([
      AccountLockRepository,
      AccountLockService,
    ]);
    expect(Reflect.getMetadata('exports', AccountLockModule)).toBeUndefined();
  });
});

describe('TKB18-09 (TK-19, H3) — câu khoá của repository: thứ tự khoá cả tập Toàn hệ thống là điều ngăn deadlock', () => {
  // Không dựa vào việc InnoDB hiện trả hàng theo PRIMARY (đổi chỉ mục hay kế hoạch là mất): thứ tự phải nằm TRONG câu lệnh.
  const repository = new AccountLockRepository({} as never);
  const flat = (sql: string) => sql.replace(/\s+/g, ' ').trim();

  it('khoá cả tập bằng một bảng, theo tai_khoan_id TĂNG DẦN, FOR UPDATE, id đi bằng tham số', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const manager = {
      query: vi.fn((sql: string, params: unknown[]) => {
        captured.push({ sql, params });
        return Promise.resolve([]);
      }),
    } as unknown as EntityManager;
    await repository.lockAccounts(manager, ['3', '1', '2']);
    expect(captured).toHaveLength(1);
    expect(flat(captured[0]!.sql)).toContain(
      'FROM tai_khoan WHERE tai_khoan_id IN (?, ?, ?) ORDER BY tai_khoan_id ASC FOR UPDATE',
    );
    // Id không nối vào chuỗi SQL
    expect(captured[0]!.sql).not.toMatch(/IN \(\s*3/);
    expect(captured[0]!.params).toEqual(['3', '1', '2']);
  });

  it('tập rỗng không gửi câu lệnh nào', async () => {
    const query = vi.fn();
    const manager = { query } as unknown as EntityManager;
    expect(await repository.lockAccounts(manager, [])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('khoá đích đơn: `FOR UPDATE OF t` (chỉ hàng tai_khoan) khi lock = true; đọc thường (không khoá) khi lock = false', async () => {
    const captured: string[] = [];
    const manager = {
      connection: {
        driver: {
          escapeQueryWithParameters: (sql: string) => [sql, []],
        },
      },
      query: vi.fn((sql: string) => {
        captured.push(flat(sql));
        return Promise.resolve([]);
      }),
    } as unknown as EntityManager;
    const visibility = { sql: '1 = 1', parameters: {} };
    await repository.readTarget(manager, visibility, '5', true);
    await repository.readTarget(manager, visibility, '5', false);
    expect(captured[0]).toMatch(/ FOR UPDATE OF t$/);
    expect(captured[0]).not.toMatch(/FOR UPDATE(?! OF t)/);
    expect(captured[1]).not.toContain('FOR UPDATE');
  });
});
