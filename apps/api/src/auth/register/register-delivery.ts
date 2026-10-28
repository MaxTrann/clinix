import type { Logger } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { REGISTER_ERROR_CODES } from '../auth.constants.js';
import type { IssuedOtp } from '../otp/issued-otp.js';
import { OtpDeliveryError } from '../otp/otp-errors.js';
import { OtpService } from '../otp/otp.service.js';
import type { Recipient } from '../otp/otp.types.js';
import type { RegisterResult } from './register.types.js';
import { resendAvailableAt } from './unverified-account-rules.js';

/**
 * Pha 2 của MỌI lần cấp OTP đăng ký (NGOÀI giao dịch): dùng chung cho POST /auth/register (A5) và /auth/register/resend-otp (A6) để hai nơi
 * không lệch nhau về cách báo lỗi gửi thư (DK-25, DK-48). Gửi lỗi: tài khoản và việc cấp mã đã commit ở pha 1 nên GIỮ NGUYÊN; OtpService đã
 * thu hồi chính hàng mới (chưa gửi) và giữ mã cũ (N1). FE nhận maXacThucId của hàng lỗi để "Gửi lại mã" bằng chính nó và mốc được gửi
 * lại (hàng lỗi vẫn tính vào giới hạn gửi lại). `logger` do nơi gọi truyền vào để dòng log mang đúng tên dịch vụ của nơi gọi.
 */
export async function deliverRegistrationOtp(
  otp: OtpService,
  logger: Pick<Logger, 'warn'>,
  issued: IssuedOtp,
  recipient: Recipient,
): Promise<RegisterResult> {
  const coTheGuiLaiLuc = resendAvailableAt(issued.hetHanLuc);
  try {
    await otp.deliver(issued, recipient);
  } catch (error) {
    if (error instanceof OtpDeliveryError) {
      logger.warn(
        `Gửi OTP đăng ký lỗi (${error.kind}): tài khoản vẫn giữ, mã xác thực ${error.maXacThucId} đã bị thu hồi`,
      );
      throw new AppException(503, REGISTER_ERROR_CODES.MAIL_FAILED, {
        thongBao: 'Không gửi được email. Vui lòng thử lại sau ít phút.',
        // Cố ý KHÔNG nêu loại lỗi SMTP: người ngoài không cần biết hạ tầng thư đang hỏng ở đâu
        chiTiet: {
          maXacThucId: error.maXacThucId,
          coTheGuiLaiLuc: coTheGuiLaiLuc.toISOString(),
        },
        cause: error,
      });
    }
    throw error;
  }
  return {
    maXacThucId: issued.maXacThucId,
    hetHanLuc: issued.hetHanLuc,
    coTheGuiLaiLuc,
  };
}
