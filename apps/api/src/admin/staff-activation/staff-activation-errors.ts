import { AppException } from '../../common/errors/app.exception.js';
import type { IssueFailure } from './activation-link.types.js';
import { STAFF_ACTIVATION_ERROR_CODES } from './staff-activation.constants.js';

// Mã lỗi của liên kết kích hoạt (PLAN 5.9). Câu chữ giữ nguyên PLAN; FE chọn thông báo theo MÃ, câu này chỉ là mặc định cho người đọc phản hồi thô.
const HTTP_STATUS: Record<IssueFailure['code'], number> = {
  GUI_LAI_QUA_SOM: 429,
  TAI_KHOAN_KHONG_CHO_KICH_HOAT: 409,
};

const MESSAGES: Record<IssueFailure['code'], string> = {
  // Cùng chữ với OTP (auth/otp/otp-errors.ts) để FE chỉ cần một cách xử lý
  GUI_LAI_QUA_SOM: 'Vui lòng thử lại sau.',
  TAI_KHOAN_KHONG_CHO_KICH_HOAT:
    'Tài khoản không còn chờ kích hoạt. Nếu cần đặt lại mật khẩu, dùng "Quên mật khẩu".',
};

// Chữ ĐÃ duyệt ở PLAN admin 5.9 (không phải [đề xuất]); FE chọn thông báo theo MÃ, câu này chỉ là mặc định cho người đọc phản hồi thô
const INVALID_LINK_MESSAGE =
  'Liên kết kích hoạt không còn hiệu lực. Vui lòng liên hệ Quản trị viên để được gửi lại.';

/**
 * 400 `LIEN_KET_KHONG_HOP_LE` (task B16). MỌI lý do liên kết không dùng được (sai token, id không có, sai dạng, hết hạn, đã dùng, bị thay, chưa gửi,
 * tài khoản không còn chờ kích hoạt) trả CÙNG mã, CÙNG chữ, không `loi`, không `chiTiet`, để người ngoài không phân biệt được (NS-35, H6).
 */
export function invalidActivationLink(): AppException {
  return new AppException(400, STAFF_ACTIVATION_ERROR_CODES.LINK_INVALID, {
    thongBao: INVALID_LINK_MESSAGE,
  });
}

/**
 * Đổi `failure` của ActivationLinkService.issue thành AppException để B15/B20 ném. Chỉ `GUI_LAI_QUA_SOM` có `chiTiet` (`{ soGiayCho }`,
 * để FE đếm ngược); lý do chi tiết (`reason`) KHÔNG đưa ra HTTP. Không dùng toOtpException của auth để khỏi buộc ngữ nghĩa OTP vào admin.
 */
export function toIssueException(failure: IssueFailure): AppException {
  return new AppException(HTTP_STATUS[failure.code], failure.code, {
    thongBao: MESSAGES[failure.code],
    ...(failure.code === STAFF_ACTIVATION_ERROR_CODES.RESEND_TOO_SOON
      ? { chiTiet: { soGiayCho: failure.retryAfterSeconds } }
      : {}),
  });
}
