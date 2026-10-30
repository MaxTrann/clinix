import { Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import type { ConsumeFailureReason } from '../otp/otp.types.js';
import { notRegistered, pendingActivation } from './forgot-password.service.js';
import { ResetPasswordService } from './reset-password.service.js';

// Task A12 — dịch vụ với phụ thuộc giả: THỨ TỰ (kiểm token → băm NGOÀI giao dịch → giao dịch: khoá tài khoản, kiểm lại tư cách, consume, rồi mới ghi),
// LOẠI giao dịch (`otp.transaction`, ca CJ-U04 của A7: mức cô lập không đọc được bằng SQL, TECH_DEBT dòng 30), cùng `em` ở mọi bước, ánh xạ lỗi và
// "lỗi chỉ ném SAU khi giao dịch kết thúc". Logic cần DB thật: reset-password.service.int-spec.ts. Mã MKU-Snn là [đề xuất].
// Test case: QM-08 (dịch vụ không chạy khi DTO sai: e2e), QM-11, QM-13, QM-17, QM-19, QM-20 (mức đơn vị).
const T0 = new Date('2026-11-02T01:00:00.000Z');
const em = { tag: 'em' } as unknown as EntityManager;
const TOKEN = 'reset-token-gia';
const PASSWORD = 'Mat-Khau-Moi-8!';
const NEW_HASH = '$argon2id$moi';

const account = (overrides: Record<string, unknown> = {}) => ({
  taiKhoanId: '7',
  email: 'da.luu@example.com',
  hoTen: 'Nguyễn Văn A',
  loaiTaiKhoan: 'BenhNhan',
  daXacMinhEmail: true,
  trangThai: 'DangHoatDong',
  thoiDiemTao: new Date(T0.getTime() - 3600_000),
  matKhauBam: '$argon2id$cu',
  ...overrides,
});

function build(locked: unknown = account()) {
  const events: string[] = [];
  let open = false;
  const resetTokens = {
    verify: vi.fn((_token: string) => {
      events.push('kiểm token');
      return Promise.resolve({ taiKhoanId: '7', maXacThucId: '11' } as unknown);
    }),
  };
  const hasher = {
    hash: vi.fn((_plain: string) => {
      events.push(open ? 'băm TRONG giao dịch' : 'băm');
      return Promise.resolve(NEW_HASH);
    }),
  };
  const otp = {
    transaction: vi.fn(
      async (work: (manager: EntityManager) => Promise<unknown>) => {
        open = true;
        events.push('giao dịch bắt đầu');
        // "kết thúc" = work trả về (commit); "hoàn tác" = work ném (rollback): lỗi nghiệp vụ phải đi đường thứ nhất
        try {
          const result = await work(em);
          events.push('giao dịch kết thúc');
          return result;
        } catch (error) {
          events.push('giao dịch hoàn tác');
          throw error;
        } finally {
          open = false;
        }
      },
    ),
    consume: vi.fn((_input: unknown, _options: unknown) => {
      events.push('consume');
      return Promise.resolve({ ok: true } as unknown);
    }),
    revokePending: vi.fn((_id: string, _loai: string, _options: unknown) => {
      events.push('thu hồi mã đăng ký');
      return Promise.resolve(2);
    }),
    clearRegistrationData: vi.fn((_id: string, _options: unknown) => {
      events.push('xoá dữ liệu đăng ký');
      return Promise.resolve(2);
    }),
  };
  const accounts = {
    findForPasswordResetForUpdate: vi.fn((_em: unknown, _id: string) => {
      events.push('khoá tài khoản');
      return Promise.resolve(locked);
    }),
    setPasswordAfterReset: vi.fn((_em: unknown, _id: string, _h: string) => {
      events.push('ghi mật khẩu');
      return Promise.resolve(true);
    }),
  };
  const sessions = {
    revokeAll: vi.fn((_id: string, _options: unknown) => {
      events.push('thu hồi phiên');
      return Promise.resolve(3);
    }),
  };
  const service = new ResetPasswordService(
    accounts as never,
    hasher as never,
    otp as never,
    sessions as never,
    resetTokens as never,
  );
  const reset = () =>
    service.reset({ resetToken: TOKEN, matKhauMoi: PASSWORD });
  return {
    service,
    reset,
    events,
    resetTokens,
    hasher,
    otp,
    accounts,
    sessions,
  };
}

/** Lỗi phải là AppException và chỉ được ném SAU khi giao dịch (nếu có mở) đã kết thúc. */
async function refusalOf(
  run: () => Promise<unknown>,
  events: string[],
): Promise<AppException> {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof AppException)) throw error;
    if (events.includes('giao dịch bắt đầu')) {
      expect(
        events.at(-1),
        'lỗi nghiệp vụ ném SAU khi giao dịch kết thúc',
      ).toBe('giao dịch kết thúc');
    }
    return error;
  }
  throw new Error('Mong đợi AppException nhưng thao tác thành công');
}

const WRITES = [
  'ghi mật khẩu',
  'thu hồi phiên',
  'thu hồi mã đăng ký',
  'xoá dữ liệu đăng ký',
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ResetPasswordService.reset — thứ tự và giao dịch', () => {
  it('MKU-S01 thứ tự đúng: kiểm token → băm NGOÀI giao dịch → khoá tài khoản → consume → ghi mật khẩu → thu hồi MỌI phiên; trả đúng hai cờ', async () => {
    const { reset, events, resetTokens, hasher } = build();

    const result = await reset();

    expect(events).toEqual([
      'kiểm token',
      'băm',
      'giao dịch bắt đầu',
      'khoá tài khoản',
      'consume',
      'ghi mật khẩu',
      'thu hồi phiên',
      'giao dịch kết thúc',
    ]);
    expect(result).toEqual({ taiKhoanNgung: false, canDangKyLai: false });
    // Dùng ĐÚNG ResetTokenService.verify với token gửi lên, đồng hồ mặc định (currentSecond)
    expect(resetTokens.verify.mock.calls).toEqual([[TOKEN]]);
    expect(hasher.hash.mock.calls).toEqual([[PASSWORD]]);
  });

  it('MKU-S02 M-RR mọi bước nằm trong MỘT `otp.transaction` (READ COMMITTED) và dùng CÙNG `em`; consume đúng hàng của token, loại QuenMatKhau; revokeAll không có ngoại lệ phiên', async () => {
    const { reset, otp, accounts, sessions } = build();

    await reset();

    expect(otp.transaction).toHaveBeenCalledTimes(1);
    expect(accounts.findForPasswordResetForUpdate.mock.calls).toEqual([
      [em, '7'],
    ]);
    expect(otp.consume.mock.calls).toEqual([
      [
        { maXacThucId: '11', taiKhoanId: '7', loai: 'QuenMatKhau' },
        { manager: em },
      ],
    ]);
    expect(accounts.setPasswordAfterReset.mock.calls).toEqual([
      [em, '7', NEW_HASH],
    ]);
    expect(sessions.revokeAll.mock.calls).toEqual([['7', { manager: em }]]);
  });

  it('MKU-S03 QM-17 tài khoản chưa xác minh: thu hồi mọi mã DangKy rồi xoá dữ liệu đăng ký, trong cùng `em`, SAU khi thu hồi phiên; cờ canDangKyLai', async () => {
    const { reset, events, otp } = build(account({ daXacMinhEmail: false }));

    expect(await reset()).toEqual({ taiKhoanNgung: false, canDangKyLai: true });

    expect(events.slice(-4)).toEqual([
      'thu hồi phiên',
      'thu hồi mã đăng ký',
      'xoá dữ liệu đăng ký',
      'giao dịch kết thúc',
    ]);
    expect(otp.revokePending.mock.calls).toEqual([
      ['7', 'DangKy', { manager: em }],
    ]);
    expect(otp.clearRegistrationData.mock.calls).toEqual([
      ['7', { manager: em }],
    ]);
  });

  it('MKU-S04 QM-19 NgungHoatDong có mật khẩu: vẫn đặt lại (ghi mật khẩu, thu hồi phiên), cờ taiKhoanNgung', async () => {
    const { reset, accounts } = build(account({ trangThai: 'NgungHoatDong' }));

    expect(await reset()).toEqual({ taiKhoanNgung: true, canDangKyLai: false });
    expect(accounts.setPasswordAfterReset).toHaveBeenCalledTimes(1);
  });
});

describe('ResetPasswordService.reset — từ chối', () => {
  const EXPIRED_BODY = {
    maLoi: 'RESET_TOKEN_HET_HIEU_LUC',
    thongBao:
      'Yêu cầu đặt lại mật khẩu đã hết hiệu lực. Vui lòng nhập email để nhận mã mới.',
  };

  it('MKU-S05 QM-11 token không dùng được (verify trả null): 403 RESET_TOKEN_HET_HIEU_LUC, KHÔNG băm, KHÔNG mở giao dịch, không log', async () => {
    const { reset, events, resetTokens, hasher, otp } = build();
    resetTokens.verify.mockResolvedValueOnce(null);
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const error = vi.spyOn(Logger.prototype, 'error');

    const refusal = await refusalOf(reset, events);

    expect(refusal.getStatus()).toBe(403);
    expect(refusal.getResponse()).toEqual(EXPIRED_BODY);
    expect(hasher.hash).not.toHaveBeenCalled();
    expect(otp.transaction).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it.each<[ConsumeFailureReason, 'warn' | 'error']>([
    ['USED', 'warn'],
    ['REVOKED', 'warn'],
    ['NOT_FOUND', 'error'],
    ['WRONG_ACCOUNT', 'error'],
    ['WRONG_TYPE', 'error'],
    ['NOT_SENT', 'error'],
  ])(
    'MKU-S06 QM-13 consume báo %s: CÙNG 403 RESET_TOKEN_HET_HIEU_LUC, KHÔNG ghi gì, log mức %s có mã tài khoản và mã xác thực',
    async (reason, level) => {
      const { reset, events, otp } = build();
      otp.consume.mockResolvedValueOnce({ ok: false, reason });
      const spy = vi.spyOn(Logger.prototype, level);

      const refusal = await refusalOf(reset, events);

      expect(refusal.getStatus()).toBe(403);
      expect(refusal.getResponse()).toEqual(EXPIRED_BODY);
      expect(events.filter((event) => WRITES.includes(event))).toEqual([]);
      expect(String(spy.mock.calls[0]?.[0])).toMatch(
        /^Tài khoản 7: resetToken không dùng được \(mã xác thực 11: /,
      );
    },
  );

  it('MKU-S07 tài khoản đã bị xoá (khoá không thấy hàng): 403 RESET_TOKEN_HET_HIEU_LUC, không consume, không ghi', async () => {
    const { reset, events, otp } = build(null);

    const refusal = await refusalOf(reset, events);

    expect(refusal.getResponse()).toEqual(EXPIRED_BODY);
    expect(otp.consume).not.toHaveBeenCalled();
    expect(events.filter((event) => WRITES.includes(event))).toEqual([]);
  });

  it.each([
    [
      'Bệnh nhân chưa xác minh đúng 24:00:00 (nửa mở)',
      {
        daXacMinhEmail: false,
        thoiDiemTao: new Date(T0.getTime() - 86_400_000),
      },
      notRegistered,
    ],
    [
      'nhân sự ChoKichHoat',
      { loaiTaiKhoan: 'LeTan', trangThai: 'ChoKichHoat', matKhauBam: null },
      pendingActivation,
    ],
    [
      'NgungHoatDong chưa từng có mật khẩu',
      { trangThai: 'NgungHoatDong', matKhauBam: null },
      pendingActivation,
    ],
  ])(
    'MKU-S08 %s dưới khoá: CÙNG lỗi của A11 (404 EMAIL_CHUA_DANG_KY / 403 TAI_KHOAN_CHUA_KICH_HOAT), không consume, không ghi',
    async (_label, overrides, expected) => {
      const { reset, events, otp } = build(account(overrides));

      const refusal = await refusalOf(reset, events);

      const reference = expected();
      expect(refusal.getStatus()).toBe(reference.getStatus());
      expect(refusal.getResponse()).toEqual(reference.getResponse());
      expect(otp.consume).not.toHaveBeenCalled();
      expect(events.filter((event) => WRITES.includes(event))).toEqual([]);
    },
  );

  it('MKU-S09 Bệnh nhân chưa xác minh còn 1 giây (23:59:59): được đặt lại', async () => {
    const { reset } = build(
      account({
        daXacMinhEmail: false,
        thoiDiemTao: new Date(T0.getTime() - 86_400_000 + 1000),
      }),
    );
    expect(await reset()).toEqual({ taiKhoanNgung: false, canDangKyLai: true });
  });

  it('MKU-S10 QM-20 ghi mật khẩu không ra đúng một hàng: lỗi hệ thống (không phải AppException) ném TỪ TRONG giao dịch để hoàn tác, không thu hồi phiên', async () => {
    const { reset, accounts, sessions } = build();
    accounts.setPasswordAfterReset.mockResolvedValueOnce(false);

    await expect(reset()).rejects.toThrow(
      'Không ghi được mật khẩu mới của tài khoản 7 dù đã khoá và kiểm điều kiện',
    );
    await expect(reset()).resolves.toBeDefined(); // lần sau ghi được thì chạy bình thường
    expect(sessions.revokeAll).toHaveBeenCalledTimes(1);
  });
});
