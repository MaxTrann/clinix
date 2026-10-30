import { UNVERIFIED_ACCOUNT_TTL_MS } from '../auth.constants.js';
import {
  passwordResetRefusalFor,
  type PasswordResetFacts,
} from './forgot-password-rules.js';

// Task A11 — hàm thuần "tài khoản nào được cấp OTP quên mật khẩu". Test case: QM-03, QM-04 (S4), Q6, QM-19, DN-21; mã FR-nn là [đề xuất].
const NOW = new Date('2026-11-02T01:00:00.000Z');
const DAY = UNVERIFIED_ACCOUNT_TTL_MS;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const account = (
  overrides: Partial<PasswordResetFacts> = {},
): PasswordResetFacts => ({
  loaiTaiKhoan: 'BenhNhan',
  daXacMinhEmail: true,
  trangThai: 'DangHoatDong',
  thoiDiemTao: ago(3600_000),
  matKhauBam: '$argon2id$gia',
  ...overrides,
});

describe('passwordResetRefusalFor', () => {
  it('FR-01 tài khoản đã xác minh có mật khẩu: được cấp', () => {
    expect(passwordResetRefusalFor(account(), NOW)).toBeNull();
  });

  it.each(['BacSi', 'LeTan', 'QuanTriVien'] as const)(
    'FR-02 nhân sự %s đang hoạt động: được cấp (như bệnh nhân)',
    (loaiTaiKhoan) => {
      expect(
        passwordResetRefusalFor(account({ loaiTaiKhoan }), NOW),
      ).toBeNull();
    },
  );

  it('FR-03 QM-03 nhân sự ChoKichHoat: từ chối PENDING_ACTIVATION (kể cả khi đã gán nhầm mật khẩu)', () => {
    const pending = account({
      loaiTaiKhoan: 'LeTan',
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
    });
    expect(passwordResetRefusalFor(pending, NOW)).toBe('PENDING_ACTIVATION');
    expect(
      passwordResetRefusalFor({ ...pending, matKhauBam: '$argon2id$gia' }, NOW),
    ).toBe('PENDING_ACTIVATION');
  });

  it('FR-04 QM-04 mật khẩu NULL mà NgungHoatDong: xử lý như chưa kích hoạt', () => {
    expect(
      passwordResetRefusalFor(
        account({
          loaiTaiKhoan: 'BacSi',
          trangThai: 'NgungHoatDong',
          matKhauBam: null,
        }),
        NOW,
      ),
    ).toBe('PENDING_ACTIVATION');
  });

  it('FR-05 QM-19 NgungHoatDong ĐÃ có mật khẩu: được cấp (S4: đặt lại được, vẫn ngưng)', () => {
    expect(
      passwordResetRefusalFor(account({ trangThai: 'NgungHoatDong' }), NOW),
    ).toBeNull();
  });

  it('FR-06 Q6 Bệnh nhân chưa xác minh còn trong 24 giờ: được cấp; 23:59:59 vẫn được', () => {
    const unverified = account({ daXacMinhEmail: false });
    expect(passwordResetRefusalFor(unverified, NOW)).toBeNull();
    expect(
      passwordResetRefusalFor(
        { ...unverified, thoiDiemTao: ago(DAY - 1000) },
        NOW,
      ),
    ).toBeNull();
  });

  it.each([0, 1000, 3600_000])(
    'FR-07 Bệnh nhân chưa xác minh quá hạn (đúng 24:00:00 và %i ms sau đó, nửa mở): coi như chưa đăng ký',
    (extra) => {
      expect(
        passwordResetRefusalFor(
          account({ daXacMinhEmail: false, thoiDiemTao: ago(DAY + extra) }),
          NOW,
        ),
      ).toBe('NOT_REGISTERED');
    },
  );

  it('FR-08 Bệnh nhân chưa xác minh bị NgungHoatDong KHÔNG hết hạn (A5-F: không bao giờ xoá lười): được cấp dù đã quá 24 giờ', () => {
    expect(
      passwordResetRefusalFor(
        account({
          daXacMinhEmail: false,
          trangThai: 'NgungHoatDong',
          thoiDiemTao: ago(10 * DAY),
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it('FR-09 hạn 24 giờ chỉ áp cho Bệnh nhân: nhân sự chưa xác minh cũ vẫn được cấp, tài khoản đã xác minh cũ vẫn được cấp', () => {
    expect(
      passwordResetRefusalFor(
        account({
          loaiTaiKhoan: 'LeTan',
          daXacMinhEmail: false,
          thoiDiemTao: ago(10 * DAY),
        }),
        NOW,
      ),
    ).toBeNull();
    expect(
      passwordResetRefusalFor(account({ thoiDiemTao: ago(10 * DAY) }), NOW),
    ).toBeNull();
  });
});
