import type { ConsumeFailureReason } from '../otp/otp.types.js';
import {
  isOpenRegistration,
  type AccountFacts,
} from '../register/unverified-account-rules.js';

// Quy tắc của bước đặt mật khẩu mới (task A12; quyết định N3, N7, TRACKING A12-A…) dưới dạng HÀM THUẦN. Ai được đặt lại thì dùng lại ĐÚNG
// `passwordResetRefusalFor` của A11 (forgot-password-rules.ts), kiểm lại dưới khoá; file này chỉ có phần riêng của A12.

/** Hai cờ cho khung "Hoàn tất" của FE (F4). Không mang thêm thông tin nào về tài khoản. */
export interface ResetPasswordFlags {
  /** Tài khoản đang NgungHoatDong: mật khẩu đã đổi nhưng vẫn chưa đăng nhập được (S4, N7, QM-19) */
  taiKhoanNgung: boolean;
  /** Bệnh nhân chưa xác minh đang hoạt động: phải đăng ký lại bằng email này để nhận OTP mới (N3, QM-17) */
  canDangKyLai: boolean;
}

/**
 * Cờ theo trạng thái ĐỌC DƯỚI KHOÁ. Bệnh nhân chưa xác minh mà bị ngưng: `taiKhoanNgung` đúng, `canDangKyLai` sai, vì đăng ký lại email đó sẽ bị
 * EMAIL_DA_DUNG (quyết định A5-F), hướng dẫn đăng ký lại là sai.
 */
export function resetFlagsFor(account: AccountFacts): ResetPasswordFlags {
  return {
    taiKhoanNgung: account.trangThai === 'NgungHoatDong',
    canDangKyLai: isOpenRegistration(account),
  };
}

/**
 * N3: tài khoản chưa xác minh email (mọi trạng thái được đặt lại) ⇒ thu hồi mọi mã DangKy chưa dùng và xoá dữ liệu đăng ký của chúng, để mật khẩu cũ
 * nằm trong hàng OTP không còn được ghi vào tài khoản. Tài khoản không có hàng DangKy nào thì hai câu lệnh không làm gì.
 */
export const revokesRegistrations = (
  account: Pick<AccountFacts, 'daXacMinhEmail'>,
): boolean => !account.daXacMinhEmail;

/**
 * Lý do `OtpService.consume` từ chối, kèm câu ghi log. `expected` = chuyện bình thường của người dùng (đã dùng token, đã bấm "Gửi lại mã"); còn lại là
 * token ký đúng khoá mà không khớp hàng OTP nào hợp lệ: không thể xảy ra nếu khoá còn bí mật, nên ghi ERROR. Client luôn nhận CÙNG một mã.
 */
export const CONSUME_REFUSALS: Record<
  ConsumeFailureReason,
  { expected: boolean; log: string }
> = {
  USED: { expected: true, log: 'mã đã được dùng để đặt mật khẩu' },
  REVOKED: { expected: true, log: 'mã đã bị thu hồi vì mã mới hơn đã gửi' },
  NOT_FOUND: { expected: false, log: 'không còn hàng mã xác thực' },
  WRONG_ACCOUNT: { expected: false, log: 'hàng mã thuộc tài khoản khác' },
  WRONG_TYPE: { expected: false, log: 'hàng mã không phải QuenMatKhau' },
  NOT_SENT: { expected: false, log: 'hàng mã chưa từng gửi thành công' },
};
