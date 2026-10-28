import { AppException } from '../../common/errors/app.exception.js';
import { MailSendError } from '../../mail/mail-send.error.js';
import type { OtpFailure, OtpFailureCode } from './otp.types.js';

// Mã lỗi OTP (PLAN 5.5). Trạng thái HTTP và câu chữ là [đề xuất] của AI, nhóm chưa duyệt: PLAN chỉ có mã và câu chữ.
export const OTP_ERROR_CODES = {
  WRONG_CODE: 'OTP_SAI',
  EXPIRED: 'OTP_HET_HAN',
  ATTEMPTS_EXHAUSTED: 'OTP_HET_LUOT',
  REPLACED: 'OTP_BI_THAY_THE',
  REGISTRATION_VOID: 'CAN_DANG_KY_LAI',
  RESEND_TOO_SOON: 'GUI_LAI_QUA_SOM',
} as const satisfies Record<string, OtpFailureCode>;

const HTTP_STATUS: Record<OtpFailureCode, number> = {
  OTP_SAI: 400,
  OTP_HET_HAN: 400,
  OTP_HET_LUOT: 400,
  OTP_BI_THAY_THE: 409,
  CAN_DANG_KY_LAI: 409,
  GUI_LAI_QUA_SOM: 429,
};

// Câu chữ theo PLAN 5.5. FE chọn thông báo theo MÃ, không theo câu chữ; câu này chỉ là mặc định cho người đọc phản hồi thô.
const MESSAGES: Record<OtpFailureCode, string> = {
  OTP_SAI: 'Mã OTP không đúng. Vui lòng kiểm tra lại.',
  OTP_HET_HAN: 'Mã OTP đã hết hạn. Vui lòng bấm "Gửi lại mã".',
  OTP_HET_LUOT:
    'Bạn đã nhập sai quá 5 lần. Mã đã bị vô hiệu, vui lòng bấm "Gửi lại mã".',
  OTP_BI_THAY_THE:
    'Yêu cầu xác minh này đã được thay bằng lần đăng ký mới hơn. Vui lòng đăng ký lại.',
  CAN_DANG_KY_LAI:
    'Yêu cầu xác minh không còn hiệu lực. Vui lòng đăng ký lại bằng email này.',
  GUI_LAI_QUA_SOM: 'Vui lòng thử lại sau.',
};

/**
 * Đổi một kết quả `{ ok: false, failure }` của OtpService thành AppException để controller ném.
 * Chỉ `GUI_LAI_QUA_SOM` có `chiTiet` (`{ soGiayCho }`, để FE đếm ngược). Lý do chi tiết (`reason`) và số lần sai KHÔNG đưa ra HTTP.
 * Lưu ý: OtpService trả lỗi nghiệp vụ thay vì ném, vì nếu ném bên trong giao dịch thì lần đếm sai bị ROLLBACK theo.
 */
export function toOtpException(failure: OtpFailure): AppException {
  return new AppException(HTTP_STATUS[failure.code], failure.code, {
    thongBao: MESSAGES[failure.code],
    ...(failure.code === 'GUI_LAI_QUA_SOM' &&
    failure.retryAfterSeconds !== undefined
      ? { chiTiet: { soGiayCho: failure.retryAfterSeconds } }
      : {}),
  });
}

/**
 * Lỗi gửi thư của OtpService.deliver / issueAndDeliver. Vẫn là MailSendError (nơi gọi bắt chung được) nhưng mang thêm
 * `maXacThucId` của hàng vừa bị thu hồi vì gửi lỗi, để FE "Gửi lại mã" bằng chính mã đó (DK-48).
 * Cách đổi sang mã `GUI_MAIL_LOI` cho FE do A5 quyết định (TRACKING mục 5, P4).
 */
export class OtpDeliveryError extends MailSendError {
  readonly maXacThucId: string;

  constructor(cause: MailSendError, maXacThucId: string) {
    super(
      cause.kind,
      cause.smtpCode === undefined ? {} : { smtpCode: cause.smtpCode },
    );
    this.name = 'OtpDeliveryError';
    this.maXacThucId = maXacThucId;
  }
}
