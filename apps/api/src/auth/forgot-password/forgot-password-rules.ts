import type { TaiKhoan } from '../entities/tai-khoan.entity.js';
import {
  isExpiredUnverifiedPatient,
  type AccountFacts,
} from '../register/unverified-account-rules.js';

// Quy tắc "tài khoản nào được cấp OTP quên mật khẩu" dưới dạng HÀM THUẦN (task A11; PLAN A11, quyết định Q6, S4, TRACKING A11-C).
export type PasswordResetFacts = AccountFacts & Pick<TaiKhoan, 'matKhauBam'>;

export type PasswordResetRefusal =
  // Coi như chưa đăng ký: Bệnh nhân chưa xác minh đã quá 24 giờ mà job dọn chưa chạy (email thực ra đã "trống", đăng ký lại sẽ xoá lười tài khoản này)
  | 'NOT_REGISTERED'
  // Nhân sự chưa tự đặt mật khẩu: đi qua liên kết kích hoạt, không gửi OTP (S4). Gồm cả NgungHoatDong mà chưa từng có mật khẩu (QM-04)
  | 'PENDING_ACTIVATION';

/**
 * `null` = được cấp OTP. Được phép: tài khoản đã xác minh, Bệnh nhân chưa xác minh còn trong 24 giờ (Q6), nhân sự đang hoạt động, tài khoản
 * `NgungHoatDong` ĐÃ có mật khẩu (S4, QM-19: vẫn ngưng sau khi đặt lại, A12 báo), tài khoản đang bị khoá đăng nhập tạm (DN-21).
 * Hạn 24 giờ dùng đúng hàm của A5, A6, A7, A8 (nửa mở: đúng 24:00:00 là hết).
 */
export function passwordResetRefusalFor(
  account: PasswordResetFacts,
  now: Date,
): PasswordResetRefusal | null {
  if (isExpiredUnverifiedPatient(account, now)) return 'NOT_REGISTERED';
  if (account.trangThai === 'ChoKichHoat' || account.matKhauBam === null) {
    return 'PENDING_ACTIVATION';
  }
  return null;
}
