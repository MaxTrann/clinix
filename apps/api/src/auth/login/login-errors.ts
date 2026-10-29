import { AppException } from '../../common/errors/app.exception.js';
import { LOGIN_ERROR_CODES, REGISTER_ERROR_CODES } from '../auth.constants.js';
import type { LoginRefusal, UnverifiedStatus } from './login-rules.js';

// Đổi kết quả đăng nhập thành lỗi API (PLAN 5.5). Trạng thái HTTP là quyết định A8-D: 401 sai thông tin; 429 khoá tạm (cùng họ
// GUI_LAI_QUA_SOM); 403 cho ba lỗi "mật khẩu đúng hoặc chưa tới bước so, nhưng tài khoản không được vào". Câu chữ theo PLAN 5.5; FE chọn thông
// báo theo MÃ, thongBao chỉ là câu mặc định.

/** 401: email không tồn tại, mật khẩu sai, hoặc mật khẩu vừa đổi. Thân LUÔN giống nhau, không "còn N lần" (G1). */
export const badCredentials = (): AppException =>
  new AppException(401, LOGIN_ERROR_CODES.BAD_CREDENTIALS, {
    thongBao: 'Email hoặc mật khẩu không đúng.',
  });

/** Tài khoản bị khoá tạm tới `lockedUntil`: 429 kèm số giây còn lại để FE đếm ngược (cùng định dạng thời gian ISO UTC như hetHanLuc của A5, A6). */
export const lockedException = (
  lockedUntil: Date,
  remainingSeconds: number,
): AppException =>
  new AppException(429, LOGIN_ERROR_CODES.LOCKED, {
    thongBao:
      'Tài khoản bị khóa tạm thời do nhập sai nhiều lần. Vui lòng thử lại sau.',
    chiTiet: {
      soGiayConLai: remainingSeconds,
      khoaDen: lockedUntil.toISOString(),
    },
  });

/** Lỗi theo lý do từ chối TRƯỚC khi so mật khẩu. NGƯNG: cùng mã, trạng thái và câu chữ với verify-otp/resend-otp của A6 (A6-D). */
export function refusalException(refusal: LoginRefusal): AppException {
  switch (refusal.kind) {
    case 'LOCKED':
      return lockedException(refusal.lockedUntil, refusal.remainingSeconds);
    case 'SUSPENDED':
      return new AppException(403, REGISTER_ERROR_CODES.ACCOUNT_SUSPENDED, {
        thongBao:
          'Tài khoản đã bị ngưng hoạt động. Vui lòng liên hệ quản trị viên.',
      });
    case 'PENDING_ACTIVATION':
      return new AppException(403, LOGIN_ERROR_CODES.PENDING_ACTIVATION, {
        thongBao:
          'Tài khoản nhân sự này chưa được kích hoạt. Hãy dùng link kích hoạt trong email để thiết lập mật khẩu.',
      });
  }
}

/**
 * 403: đúng mật khẩu nhưng chưa xác minh email, KHÔNG có phiên. `chiTiet` đủ để FE gọi verify-otp / resend-otp của A6 (email FE đã có).
 * CanDangKyLai: không còn mã để nhập nên câu mặc định hướng tới đăng ký lại.
 */
export function unverifiedException(status: UnverifiedStatus): AppException {
  return new AppException(403, LOGIN_ERROR_CODES.EMAIL_NOT_VERIFIED, {
    thongBao:
      status.trangThaiMa === 'CanDangKyLai'
        ? 'Yêu cầu xác minh email không còn hiệu lực. Vui lòng đăng ký lại bằng email này.'
        : 'Email của bạn chưa được xác minh. Nhập mã OTP đã nhận hoặc bấm "Gửi lại mã".',
    chiTiet: {
      maXacThucId: status.maXacThucId,
      trangThaiMa: status.trangThaiMa,
      hetHanLuc: status.hetHanLuc?.toISOString() ?? null,
    },
  });
}
