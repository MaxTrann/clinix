import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { AppException } from '../../common/errors/app.exception.js';
import type { TaiKhoan } from '../entities/tai-khoan.entity.js';
import type { OtpService } from '../otp/otp.service.js';
import type { PasswordHasher } from '../password/password-hasher.service.js';
import type { TaiKhoanRepository } from '../repositories/tai-khoan.repository.js';
import type { SessionService } from '../session/session.service.js';
import { LoginService } from './login.service.js';

// Task A8 — LoginService với bản giả của DB, băm, phiên và OTP: khoá THỨ TỰ gọi và cấu trúc giao dịch (không cần MySQL).
// Mã test case: DN-05, DN-14, DN-15, DN-16, DN-09 (không so mật khẩu), A8-E (kiểm lại dưới khoá), "lần đếm sai commit dù đã trả lỗi".
// Mã LS-nn là [đề xuất]. Hành vi với DB thật: login.service.int-spec.ts.
const T0 = new Date('2026-11-02T01:00:00.000Z');
const at = (seconds: number): Date => new Date(T0.getTime() + seconds * 1000);
const EM = { tag: 'giao-dich-gia' };
const HASH = '$argon2id$v=19$m=19456,p=1,t=2$gia$gia';

const account = (overrides: Partial<TaiKhoan> = {}): TaiKhoan =>
  ({
    taiKhoanId: '7',
    loaiTaiKhoan: 'BenhNhan',
    trangThai: 'DangHoatDong',
    daXacMinhEmail: true,
    thoiDiemTao: at(-3600),
    matKhauBam: HASH,
    soLanDangNhapSai: 0,
    khoaDangNhapDen: null,
    ...overrides,
  }) as TaiKhoan;

function build(read: TaiKhoan | null, locked: TaiKhoan | null = read) {
  const events: string[] = [];
  const dataSource = {
    manager: { tag: 'ket-noi-thuong' },
    transaction: vi.fn(
      async (_level: string, work: (em: unknown) => Promise<unknown>) => {
        try {
          const result = await work(EM);
          events.push('commit');
          return result;
        } catch (error) {
          events.push('rollback');
          throw error;
        }
      },
    ),
  };
  const accounts = {
    findForLogin: vi.fn(() => Promise.resolve(read)),
    findForLoginForUpdate: vi.fn(() => Promise.resolve(locked)),
    saveLoginFailure: vi.fn(() => Promise.resolve(true)),
    resetLoginFailures: vi.fn(() => Promise.resolve()),
  };
  const hasher = {
    verify: vi.fn(() => Promise.resolve(true)),
    verifyDummy: vi.fn(() => Promise.resolve(false as const)),
  };
  const issued = {
    sessionId: '55',
    accessToken: 'access-gia',
    accessTokenExpiresAt: at(900),
    refreshToken: 'refresh-gia',
    refreshTokenExpiresAt: at(1800),
  };
  const sessions = { create: vi.fn(() => Promise.resolve(issued)) };
  const otp = {
    latestStatus: vi.fn(() =>
      Promise.resolve({
        maXacThucId: '42',
        trangThaiMa: 'ConHan' as const,
        hetHanLuc: at(300),
      }),
    ),
  };
  const service = new LoginService(
    dataSource as unknown as DataSource,
    accounts as unknown as TaiKhoanRepository,
    hasher as unknown as PasswordHasher,
    sessions as unknown as SessionService,
    otp as unknown as OtpService,
  );
  return {
    service,
    dataSource,
    accounts,
    hasher,
    sessions,
    otp,
    events,
    issued,
  };
}

const credentials = {
  email: 'nguoi.dung@example.com',
  matKhau: 'Mat-Khau-Gia-1!',
};

async function failureOf(work: Promise<unknown>): Promise<AppException> {
  try {
    await work;
  } catch (error) {
    return error as AppException;
  }
  throw new Error('mong đợi bị từ chối');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('thứ tự: tìm → trạng thái → khoá → so mật khẩu', () => {
  it('LS-01 (DN-05) email không có tài khoản: so GIẢ đúng một lần, không so thật, không mở giao dịch, 401 DANG_NHAP_SAI', async () => {
    const { service, hasher, dataSource, accounts } = build(null);

    const error = await failureOf(service.login(credentials));

    expect(error.getStatus()).toBe(401);
    expect(error.maLoi).toBe('DANG_NHAP_SAI');
    expect(hasher.verifyDummy).toHaveBeenCalledTimes(1);
    expect(hasher.verifyDummy).toHaveBeenCalledWith(credentials.matKhau);
    expect(hasher.verify).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(accounts.saveLoginFailure).not.toHaveBeenCalled();
  });

  it.each([
    [
      'ChoKichHoat (DN-15)',
      { trangThai: 'ChoKichHoat', matKhauBam: null },
      403,
      'TAI_KHOAN_CHUA_KICH_HOAT',
    ],
    [
      'NgungHoatDong (DN-14)',
      { trangThai: 'NgungHoatDong' },
      403,
      'TAI_KHOAN_NGUNG',
    ],
    [
      'đang khoá tạm (DN-09)',
      { khoaDangNhapDen: at(600) },
      429,
      'TAI_KHOAN_BI_KHOA_TAM',
    ],
    [
      'NgungHoatDong và đang khoá (DN-16)',
      { trangThai: 'NgungHoatDong', khoaDangNhapDen: at(600) },
      403,
      'TAI_KHOAN_NGUNG',
    ],
  ] as const)(
    'LS-02 %s: từ chối TRƯỚC khi so mật khẩu (cả so thật lẫn so giả), không mở giao dịch, không đếm',
    async (_ten, overrides, status, maLoi) => {
      const { service, hasher, dataSource, accounts } = build(
        account(overrides as Partial<TaiKhoan>),
      );

      const error = await failureOf(service.login(credentials));

      expect({ status: error.getStatus(), maLoi: error.maLoi }).toEqual({
        status,
        maLoi,
      });
      expect(hasher.verify).not.toHaveBeenCalled();
      expect(hasher.verifyDummy).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(accounts.saveLoginFailure).not.toHaveBeenCalled();
    },
  );

  it('LS-03 (H6) băm mật khẩu NULL ở tài khoản đang hoạt động (không thể có do CHECK): không đưa null vào hàm băm, dùng so giả, coi như sai', async () => {
    const { service, hasher, accounts } = build(account({ matKhauBam: null }));

    const error = await failureOf(service.login(credentials));

    expect(error.maLoi).toBe('DANG_NHAP_SAI');
    expect(hasher.verify).not.toHaveBeenCalled();
    expect(hasher.verifyDummy).toHaveBeenCalledTimes(1);
    expect(accounts.saveLoginFailure).toHaveBeenCalledTimes(1);
  });
});

describe('giao dịch: ngắn, READ COMMITTED, băm nằm NGOÀI, lần đếm sai commit dù đã trả lỗi', () => {
  it('LS-10 băm xong rồi mới mở giao dịch READ COMMITTED; khoá hàng theo mã tài khoản bằng chính giao dịch đó', async () => {
    const { service, hasher, dataSource, accounts } = build(account());

    await service.login(credentials);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(dataSource.transaction.mock.calls[0]?.[0]).toBe('READ COMMITTED');
    // đúng MỘT lần băm, và MỌI lần băm (thật hay giả) đều xảy ra TRƯỚC khi mở giao dịch: không giữ khoá hàng hay kết nối DB trong lúc băm
    expect(hasher.verify).toHaveBeenCalledTimes(1);
    expect(hasher.verify).toHaveBeenCalledWith(HASH, credentials.matKhau);
    const transactionOrder = dataSource.transaction.mock.invocationCallOrder[0];
    expect(transactionOrder).toBeDefined();
    for (const order of [
      ...hasher.verify.mock.invocationCallOrder,
      ...hasher.verifyDummy.mock.invocationCallOrder,
    ]) {
      expect(order).toBeLessThan(transactionOrder ?? 0);
    }
    expect(accounts.findForLoginForUpdate).toHaveBeenCalledWith(EM, '7');
  });

  it('LS-11 mật khẩu SAI: giao dịch KẾT THÚC BÌNH THƯỜNG (commit) rồi mới ném 401, nên lần đếm sai không bị hoàn tác', async () => {
    const { service, hasher, events, accounts } = build(account());
    hasher.verify.mockResolvedValue(false);

    const error = await failureOf(service.login(credentials));

    expect(error.maLoi).toBe('DANG_NHAP_SAI');
    expect(events).toEqual(['commit']);
    expect(accounts.saveLoginFailure).toHaveBeenCalledWith(EM, '7', {
      failures: 1,
      lockedUntil: null,
    });
  });

  it('LS-12 (DN-08) lần sai thứ 5: ghi đúng khoá 15 phút, commit rồi mới ném 429 với 900 giây', async () => {
    const { service, hasher, events, accounts } = build(
      account({ soLanDangNhapSai: 4 }),
    );
    hasher.verify.mockResolvedValue(false);

    const error = await failureOf(service.login(credentials));

    expect(error.getStatus()).toBe(429);
    expect(events).toEqual(['commit']);
    expect(accounts.saveLoginFailure).toHaveBeenCalledWith(EM, '7', {
      failures: 5,
      lockedUntil: at(900),
    });
    expect(
      (error.getResponse() as { chiTiet: { soGiayConLai: number } }).chiTiet
        .soGiayConLai,
    ).toBe(900);
  });

  it('LS-13 (A8-E) kiểm lại DƯỚI KHOÁ: đọc ban đầu chưa khoá nhưng dưới khoá đã khoá ⇒ 429, KHÔNG đếm, KHÔNG tạo phiên dù mật khẩu đúng', async () => {
    const { service, sessions, accounts } = build(
      account({ soLanDangNhapSai: 4 }),
      account({ soLanDangNhapSai: 5, khoaDangNhapDen: at(600) }),
    );

    const error = await failureOf(service.login(credentials));

    expect(error.maLoi).toBe('TAI_KHOAN_BI_KHOA_TAM');
    expect(sessions.create).not.toHaveBeenCalled();
    expect(accounts.saveLoginFailure).not.toHaveBeenCalled();
    expect(accounts.resetLoginFailures).not.toHaveBeenCalled();
  });

  it.each([
    ['bị ngưng', { trangThai: 'NgungHoatDong' }, 'TAI_KHOAN_NGUNG'],
    [
      'về lại chờ kích hoạt',
      { trangThai: 'ChoKichHoat' },
      'TAI_KHOAN_CHUA_KICH_HOAT',
    ],
  ] as const)(
    'LS-14 (A8-E) dưới khoá tài khoản %s: từ chối, không phiên, không ghi',
    async (_ten, overrides, maLoi) => {
      const { service, sessions, accounts } = build(
        account(),
        account(overrides as Partial<TaiKhoan>),
      );

      const error = await failureOf(service.login(credentials));

      expect(error.maLoi).toBe(maLoi);
      expect(sessions.create).not.toHaveBeenCalled();
      expect(accounts.saveLoginFailure).not.toHaveBeenCalled();
      expect(accounts.resetLoginFailures).not.toHaveBeenCalled();
    },
  );

  it('LS-15 (A8-E) mật khẩu đổi sau lúc đọc: DANG_NHAP_SAI, không đếm, không phiên, không đặt về 0', async () => {
    const { service, sessions, accounts } = build(
      account(),
      account({ matKhauBam: '$argon2id$v=19$m=19456,p=1,t=2$khac$khac' }),
    );

    const error = await failureOf(service.login(credentials));

    expect(error.maLoi).toBe('DANG_NHAP_SAI');
    expect(sessions.create).not.toHaveBeenCalled();
    expect(accounts.saveLoginFailure).not.toHaveBeenCalled();
    expect(accounts.resetLoginFailures).not.toHaveBeenCalled();
  });

  it('LS-16 tài khoản biến mất giữa lúc đọc và lúc khoá: DANG_NHAP_SAI, không ghi', async () => {
    const { service, sessions, accounts } = build(account(), null);

    const error = await failureOf(service.login(credentials));

    expect(error.maLoi).toBe('DANG_NHAP_SAI');
    expect(sessions.create).not.toHaveBeenCalled();
    expect(accounts.saveLoginFailure).not.toHaveBeenCalled();
  });
});

describe('mật khẩu đúng', () => {
  it('LS-20 (DN-01) đã xác minh, bộ đếm 0: tạo phiên TRONG giao dịch đang giữ khoá; không ghi lại bộ đếm; trả vai trò và phiên', async () => {
    const { service, sessions, accounts, issued, events } = build(
      account({ loaiTaiKhoan: 'LeTan' }),
    );

    const result = await service.login(credentials);

    expect(result).toEqual({ vaiTro: 'LeTan', session: issued });
    expect(sessions.create).toHaveBeenCalledWith('7', { manager: EM });
    expect(accounts.resetLoginFailures).not.toHaveBeenCalled();
    expect(accounts.saveLoginFailure).not.toHaveBeenCalled();
    expect(events).toEqual(['commit']);
  });

  it('LS-21 (DN-11) còn bộ đếm hoặc khoá cũ: đặt về 0 TRƯỚC khi tạo phiên, trong cùng giao dịch', async () => {
    const { service, sessions, accounts } = build(
      account({ soLanDangNhapSai: 3 }),
    );

    await service.login(credentials);

    expect(accounts.resetLoginFailures).toHaveBeenCalledWith(EM, '7');
    expect(
      accounts.resetLoginFailures.mock.invocationCallOrder[0],
    ).toBeLessThan(sessions.create.mock.invocationCallOrder[0] ?? 0);
  });

  it('LS-22 (DN-17) chưa xác minh: bộ đếm về 0, KHÔNG tạo phiên, hỏi trạng thái mã đăng ký, 403 EMAIL_CHUA_XAC_MINH kèm mã lần gửi', async () => {
    const { service, sessions, accounts, otp } = build(
      account({ daXacMinhEmail: false, soLanDangNhapSai: 2 }),
    );

    const error = await failureOf(service.login(credentials));

    expect(error.getStatus()).toBe(403);
    expect(error.maLoi).toBe('EMAIL_CHUA_XAC_MINH');
    expect(sessions.create).not.toHaveBeenCalled();
    expect(accounts.resetLoginFailures).toHaveBeenCalledWith(EM, '7');
    expect(otp.latestStatus).toHaveBeenCalledWith('7', 'DangKy');
    expect((error.getResponse() as { chiTiet: unknown }).chiTiet).toEqual({
      maXacThucId: '42',
      trangThaiMa: 'ConHan',
      hetHanLuc: at(300).toISOString(),
    });
  });

  it('LS-23 (Đ12) nhân sự chưa xác minh: không phiên và ghi một dòng ERROR chỉ có mã tài khoản', async () => {
    const errorLog = vi.spyOn(Logger.prototype, 'error');
    const { service, sessions } = build(
      account({ loaiTaiKhoan: 'BacSi', daXacMinhEmail: false }),
    );

    await failureOf(service.login(credentials));

    expect(sessions.create).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(String(errorLog.mock.calls[0]?.[0])).toContain('Tài khoản 7');
    expect(String(errorLog.mock.calls[0]?.[0])).not.toContain(
      credentials.email,
    );
  });
});
