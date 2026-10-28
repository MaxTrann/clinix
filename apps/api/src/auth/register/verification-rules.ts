import {
  isExpiredUnverifiedPatient,
  isOpenRegistration,
  type AccountFacts,
} from './unverified-account-rules.js';

// Quy tắc "tài khoản này còn xác minh / nhận mã gửi lại được không" của POST /auth/register/verify-otp và /resend-otp (task A6),
// dưới dạng HÀM THUẦN (đồng hồ truyền vào) và tái dùng đúng hàm của A5 để "đăng ký mở" và "quá 24 giờ" chỉ có MỘT định nghĩa.
export type VerificationRefusal =
  /** Bệnh nhân chưa xác minh bị admin ngưng hoạt động có chủ ý (A5-F: không bị xoá, không đăng ký lại được): 403 TAI_KHOAN_NGUNG */
  | 'ACCOUNT_SUSPENDED'
  /** Đã sống từ 24 giờ trở lên (nửa mở, cùng hàm với A5) nhưng job chưa dọn: 409 CAN_DANG_KY_LAI. Chuyện bình thường, không cảnh báo. */
  | 'REGISTRATION_EXPIRED'
  /**
   * Đã xác minh, không phải Bệnh nhân, hoặc trạng thái không hợp lệ cho Bệnh nhân (ChoKichHoat): lẽ ra không còn hàng OTP sống nào của
   * tài khoản này (DK-30); có nghĩa là dữ liệu không nhất quán. 409 CAN_DANG_KY_LAI kèm cảnh báo log, không tạo bản ghi thứ hai.
   */
  | 'ACCOUNT_NOT_PENDING';

/** `null` = cho phép. Thứ tự: đăng ký mở (còn hạn thì cho, quá hạn thì từ chối) → bị ngưng → mọi trường hợp còn lại. */
export function verificationRefusalFor(
  account: AccountFacts,
  now: Date,
): VerificationRefusal | null {
  if (isOpenRegistration(account)) {
    return isExpiredUnverifiedPatient(account, now)
      ? 'REGISTRATION_EXPIRED'
      : null;
  }
  if (
    account.loaiTaiKhoan === 'BenhNhan' &&
    !account.daXacMinhEmail &&
    account.trangThai === 'NgungHoatDong'
  ) {
    return 'ACCOUNT_SUSPENDED';
  }
  return 'ACCOUNT_NOT_PENDING';
}
