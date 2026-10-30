import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { IssuedOtp } from '../otp/issued-otp.js';
import type { OtpFailure } from '../otp/otp.types.js';
import { ForgotPasswordService } from './forgot-password.service.js';

// Task A11 — dịch vụ với phụ thuộc giả: thứ tự gọi và LOẠI giao dịch (ca CJ-U04 của A7: spy khẳng định `otp.transaction` được dùng, vì mức cô lập
// không đọc được bằng SQL nên test nhiều tài khoản một mình không phân biệt được READ COMMITTED với REPEATABLE READ, TECH_DEBT dòng 30).
// Logic cần DB thật: forgot-password.service.int-spec.ts. Mã FU-nn là [đề xuất]. Test case: QM-02, QM-03, QM-09, QM-10 (đường lỗi), M35.
const T0 = new Date('2026-11-02T01:00:00.000Z');
const em = { tag: 'em' } as unknown as EntityManager;

const account = (overrides: Record<string, unknown> = {}) => ({
  taiKhoanId: '7',
  email: 'da.luu@example.com',
  hoTen: 'Nguyễn Văn A',
  loaiTaiKhoan: 'BenhNhan',
  daXacMinhEmail: true,
  trangThai: 'DangHoatDong',
  thoiDiemTao: new Date(T0.getTime() - 3600_000),
  matKhauBam: '$argon2id$gia',
  ...overrides,
});
const issuedOtp = () =>
  new IssuedOtp(
    {
      maXacThucId: '11',
      taiKhoanId: '7',
      loai: 'QuenMatKhau',
      hetHanLuc: new Date(T0.getTime() + 600_000),
    },
    '123456',
  );

function build() {
  const events: string[] = [];
  const dataSource = { manager: { tag: 'manager' }, transaction: vi.fn() };
  const accounts = {
    findForPasswordReset: vi.fn(() => Promise.resolve(account() as unknown)),
    findForPasswordResetForUpdate: vi.fn(() =>
      Promise.resolve(account() as unknown),
    ),
    findByEmail: vi.fn(() => Promise.resolve(account() as unknown)),
  };
  const otp = {
    transaction: vi.fn(
      async (work: (manager: EntityManager) => Promise<unknown>) => {
        events.push('giao dịch bắt đầu');
        const result = await work(em);
        events.push('giao dịch kết thúc');
        return result;
      },
    ),
    issue: vi.fn((_input: unknown, _options: unknown) =>
      Promise.resolve({ ok: true, issued: issuedOtp() } as unknown),
    ),
    deliver: vi.fn((_issued: unknown, _recipient: unknown) => {
      events.push('gửi thư');
      return Promise.resolve();
    }),
    verify: vi.fn((_input: unknown) =>
      Promise.resolve({
        ok: true,
        otp: { maXacThucId: '11', taiKhoanId: '7', loai: 'QuenMatKhau' },
        value: undefined,
      } as unknown),
    ),
  };
  const resetTokens = {
    sign: vi.fn((_input: unknown) =>
      Promise.resolve({
        token: 'reset-token-gia',
        expiresAt: new Date(T0.getTime() + 600_000),
      }),
    ),
  };
  const service = new ForgotPasswordService(
    dataSource as never,
    accounts as never,
    otp as never,
    resetTokens as never,
  );
  return { service, events, dataSource, accounts, otp, resetTokens };
}

async function refusalOf(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('Mong đợi AppException nhưng thao tác thành công');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('ForgotPasswordService.requestCode', () => {
  it('FU-01 M35 giao dịch mở bằng `otp.transaction` (READ COMMITTED), KHÔNG bằng giao dịch mặc định của DataSource; khoá hàng tài khoản và cấp mã trong cùng `em`', async () => {
    const { service, dataSource, accounts, otp } = build();

    await service.requestCode('da.luu@example.com');

    expect(otp.transaction).toHaveBeenCalledTimes(1);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(accounts.findForPasswordResetForUpdate).toHaveBeenCalledWith(
      em,
      '7',
    );
    expect(otp.issue).toHaveBeenCalledWith(
      { taiKhoanId: '7', loai: 'QuenMatKhau' },
      { manager: em },
    );
  });

  it('FU-02 gửi thư SAU khi giao dịch kết thúc (H9), tới email ĐÃ LƯU kèm họ tên; kết quả chỉ có hai mốc', async () => {
    const { service, events, otp } = build();

    const result = await service.requestCode('khac.hoa.thuong@example.com');

    expect(events).toEqual([
      'giao dịch bắt đầu',
      'giao dịch kết thúc',
      'gửi thư',
    ]);
    expect(otp.deliver.mock.calls[0]?.[1]).toEqual({
      email: 'da.luu@example.com',
      fullName: 'Nguyễn Văn A',
    });
    expect(Object.keys(result).sort()).toEqual(['coTheGuiLaiLuc', 'hetHanLuc']);
    expect(result.hetHanLuc).toEqual(new Date(T0.getTime() + 600_000));
    expect(result.coTheGuiLaiLuc).toEqual(new Date(T0.getTime() + 60_000));
  });

  it('FU-03 QM-02 email lạ: 404 EMAIL_CHUA_DANG_KY, KHÔNG mở giao dịch, KHÔNG cấp mã, KHÔNG gửi thư', async () => {
    const { service, accounts, otp } = build();
    accounts.findForPasswordReset.mockResolvedValue(null);

    const error = await refusalOf(service.requestCode('la@example.com'));

    expect(error.getStatus()).toBe(404);
    expect(error.maLoi).toBe('EMAIL_CHUA_DANG_KY');
    expect(otp.transaction).not.toHaveBeenCalled();
    expect(otp.issue).not.toHaveBeenCalled();
    expect(otp.deliver).not.toHaveBeenCalled();
  });

  it('FU-04 tài khoản biến mất giữa lúc đọc và lúc khoá: 404 EMAIL_CHUA_DANG_KY (không phải lỗi hệ thống), không cấp mã, không gửi thư', async () => {
    const { service, accounts, otp } = build();
    accounts.findForPasswordResetForUpdate.mockResolvedValue(null);

    const error = await refusalOf(service.requestCode('da.luu@example.com'));

    expect(error.maLoi).toBe('EMAIL_CHUA_DANG_KY');
    expect(otp.issue).not.toHaveBeenCalled();
    expect(otp.deliver).not.toHaveBeenCalled();
  });

  it.each([
    [
      'QM-03 nhân sự ChoKichHoat',
      { loaiTaiKhoan: 'LeTan', trangThai: 'ChoKichHoat', matKhauBam: null },
      403,
      'TAI_KHOAN_CHUA_KICH_HOAT',
    ],
    [
      'QM-04 NgungHoatDong chưa từng có mật khẩu',
      { loaiTaiKhoan: 'BacSi', trangThai: 'NgungHoatDong', matKhauBam: null },
      403,
      'TAI_KHOAN_CHUA_KICH_HOAT',
    ],
    [
      'Bệnh nhân chưa xác minh đã quá 24 giờ',
      {
        daXacMinhEmail: false,
        thoiDiemTao: new Date(T0.getTime() - 86_400_000),
      },
      404,
      'EMAIL_CHUA_DANG_KY',
    ],
  ])(
    'FU-05 %s: đúng mã và trạng thái HTTP, KHÔNG cấp mã, KHÔNG gửi thư; kiểm lại dưới khoá (dữ liệu khoá thắng dữ liệu đọc thường)',
    async (_label, fields, status, maLoi) => {
      const { service, accounts, otp } = build();
      // Đọc thường còn thấy tài khoản "tốt"; chỉ dữ liệu dưới khoá mới đúng: thứ tự kiểm phải theo dữ liệu dưới khoá
      accounts.findForPasswordResetForUpdate.mockResolvedValue(
        account(fields) as unknown,
      );

      const error = await refusalOf(service.requestCode('da.luu@example.com'));

      expect({ status: error.getStatus(), maLoi: error.maLoi }).toEqual({
        status,
        maLoi,
      });
      expect(otp.issue).not.toHaveBeenCalled();
      expect(otp.deliver).not.toHaveBeenCalled();
    },
  );

  it('FU-06 QM-10 vượt giới hạn gửi lại: 429 GUI_LAI_QUA_SOM kèm soGiayCho, ném SAU khi giao dịch kết thúc, không gửi thư', async () => {
    const { service, events, otp } = build();
    const failure: OtpFailure = {
      code: 'GUI_LAI_QUA_SOM',
      reason: 'TOO_SOON',
      retryAfterSeconds: 12,
    };
    otp.issue.mockResolvedValue({ ok: false, failure } as unknown);

    const error = await refusalOf(service.requestCode('da.luu@example.com'));

    expect(error.getStatus()).toBe(429);
    expect(error.maLoi).toBe('GUI_LAI_QUA_SOM');
    expect((error.getResponse() as { chiTiet: unknown }).chiTiet).toEqual({
      soGiayCho: 12,
    });
    expect(events).toEqual(['giao dịch bắt đầu', 'giao dịch kết thúc']);
    expect(otp.deliver).not.toHaveBeenCalled();
  });
});

describe('ForgotPasswordService.verifyCode', () => {
  it('FU-07 email lạ: OTP_SAI (giống mã sai), KHÔNG gọi OtpService.verify, không ghi gì', async () => {
    const { service, accounts, otp, resetTokens } = build();
    accounts.findByEmail.mockResolvedValue(null);

    const error = await refusalOf(
      service.verifyCode('la@example.com', '123456'),
    );

    expect({ status: error.getStatus(), maLoi: error.maLoi }).toEqual({
      status: 400,
      maLoi: 'OTP_SAI',
    });
    expect(otp.verify).not.toHaveBeenCalled();
    expect(resetTokens.sign).not.toHaveBeenCalled();
  });

  it('FU-08 M17 xác minh KHÔNG tiêu thụ mã: `verify` nhận đúng MỘT đối số (không có `consume`), nhắm mã QuenMatKhau mới nhất của đúng tài khoản', async () => {
    const { service, otp } = build();

    await service.verifyCode('da.luu@example.com', '012345');

    expect(otp.verify.mock.calls).toEqual([
      [{ taiKhoanId: '7', loai: 'QuenMatKhau', otp: '012345' }],
    ]);
  });

  it('FU-09 đúng: ký resetToken cho đúng tài khoản và mã xác thực, hạn tính từ LÚC NÀY (đồng hồ ứng dụng)', async () => {
    const { service, resetTokens } = build();

    const result = await service.verifyCode('da.luu@example.com', '012345');

    expect(resetTokens.sign.mock.calls).toEqual([
      [{ taiKhoanId: '7', maXacThucId: '11', issuedAt: T0 }],
    ]);
    expect(result).toEqual({
      resetToken: 'reset-token-gia',
      hetHanLuc: new Date(T0.getTime() + 600_000),
    });
    expect(Object.keys(result).sort()).toEqual(['hetHanLuc', 'resetToken']);
  });

  it.each([
    ['OTP_SAI', 'WRONG_CODE'],
    ['OTP_HET_HAN', 'EXPIRED'],
    ['OTP_HET_LUOT', 'ATTEMPTS_EXHAUSTED'],
  ] as const)(
    'FU-10 OtpService từ chối %s: 400 cùng mã, KHÔNG ký token',
    async (code, reason) => {
      const { service, otp, resetTokens } = build();
      otp.verify.mockResolvedValue({
        ok: false,
        failure: { code, reason } satisfies OtpFailure,
      } as unknown);

      const error = await refusalOf(
        service.verifyCode('da.luu@example.com', '012345'),
      );

      expect({ status: error.getStatus(), maLoi: error.maLoi }).toEqual({
        status: 400,
        maLoi: code,
      });
      expect(resetTokens.sign).not.toHaveBeenCalled();
    },
  );
});
