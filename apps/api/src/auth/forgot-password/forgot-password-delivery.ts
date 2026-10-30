import type { Logger } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { REGISTER_ERROR_CODES } from '../auth.constants.js';
import type { IssuedOtp } from '../otp/issued-otp.js';
import { OtpDeliveryError } from '../otp/otp-errors.js';
import { OtpService } from '../otp/otp.service.js';
import type { Recipient } from '../otp/otp.types.js';
import { resendAvailableAt } from '../register/unverified-account-rules.js';

/** Kết quả của `forgot-password` và `resend-otp`: hai mốc cho FE (đếm ngược 10 phút và nút "Gửi lại mã"). KHÔNG có mã OTP, KHÔNG có mã lần gửi. */
export interface PasswordResetCodeResult {
  hetHanLuc: Date;
  coTheGuiLaiLuc: Date;
}

/**
 * Pha 2 của MỌI lần cấp OTP quên mật khẩu (NGOÀI giao dịch, H9; cùng ý với register-delivery.ts của A5, A6). Gửi lỗi: hàng OTP đã commit ở pha 1,
 * OtpService đã thu hồi chính hàng mới (chưa gửi) và giữ mã cũ còn hạn (N1, QM-09); hàng lỗi vẫn tính vào giới hạn gửi lại nên FE nhận mốc
 * `coTheGuiLaiLuc`. Khác A5: `chiTiet` KHÔNG có `maXacThucId`, vì "Gửi lại mã" của quên mật khẩu chỉ nhận `{email}` (không lộ id tuần tự).
 */
export async function deliverPasswordResetOtp(
  otp: OtpService,
  logger: Pick<Logger, 'warn'>,
  issued: IssuedOtp,
  recipient: Recipient,
): Promise<PasswordResetCodeResult> {
  const coTheGuiLaiLuc = resendAvailableAt(issued.hetHanLuc);
  try {
    await otp.deliver(issued, recipient);
  } catch (error) {
    if (error instanceof OtpDeliveryError) {
      logger.warn(
        `Gửi OTP quên mật khẩu lỗi (${error.kind}): mã xác thực ${error.maXacThucId} đã bị thu hồi`,
      );
      throw new AppException(503, REGISTER_ERROR_CODES.MAIL_FAILED, {
        thongBao: 'Không gửi được email. Vui lòng thử lại sau ít phút.',
        // Cố ý KHÔNG nêu loại lỗi SMTP: người ngoài không cần biết hạ tầng thư đang hỏng ở đâu
        chiTiet: { coTheGuiLaiLuc: coTheGuiLaiLuc.toISOString() },
        cause: error,
      });
    }
    throw error;
  }
  return { hetHanLuc: issued.hetHanLuc, coTheGuiLaiLuc };
}
