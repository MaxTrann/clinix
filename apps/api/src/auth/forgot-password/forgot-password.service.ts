import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import {
  FORGOT_PASSWORD_ERROR_CODES,
  LOGIN_ERROR_CODES,
} from '../auth.constants.js';
import type { IssuedOtp } from '../otp/issued-otp.js';
import { toOtpException } from '../otp/otp-errors.js';
import { currentSecond } from '../otp/otp-time.js';
import { OtpService } from '../otp/otp.service.js';
import type { OtpFailure, Recipient } from '../otp/otp.types.js';
import { TaiKhoanRepository } from '../repositories/tai-khoan.repository.js';
import {
  deliverPasswordResetOtp,
  type PasswordResetCodeResult,
} from './forgot-password-delivery.js';
import {
  passwordResetRefusalFor,
  type PasswordResetRefusal,
} from './forgot-password-rules.js';
import { ResetTokenService } from './reset-token.service.js';

/** Kết quả của `verify-otp`: token và hạn của TOKEN (không phải hạn của OTP). */
export interface PasswordResetTokenResult {
  resetToken: string;
  hetHanLuc: Date;
}

// Email không có tài khoản: trả ĐÚNG cùng mã với "chưa từng có mã" và "sai mã" (OTP_SAI), không ghi gì, không đếm lần sai, để `verify-otp`
// không thêm một cách dò email nào (H7; email ở bước 1 đã bị lộ có chủ ý theo 2.4 QMK A1, TRACKING A11-F).
const UNKNOWN_ACCOUNT: OtpFailure = { code: 'OTP_SAI', reason: 'NOT_FOUND' };

const notRegistered = (): AppException =>
  new AppException(404, FORGOT_PASSWORD_ERROR_CODES.EMAIL_NOT_REGISTERED, {
    thongBao: 'Email chưa đăng ký.',
  });

// Câu của đăng nhập (A8). Khung QMK có câu riêng trong Figma: [cần điền] khi nhóm gửi câu chữ.
const pendingActivation = (): AppException =>
  new AppException(403, LOGIN_ERROR_CODES.PENDING_ACTIVATION, {
    thongBao:
      'Tài khoản nhân sự này chưa được kích hoạt. Hãy dùng link kích hoạt trong email để thiết lập mật khẩu.',
  });

// Câu cố định ghi vào log cho từng lý do từ chối (không bao giờ ghi email)
const REFUSAL_LOG: Record<PasswordResetRefusal, string> = {
  NOT_REGISTERED: 'Bệnh nhân chưa xác minh đã quá 24 giờ',
  PENDING_ACTIVATION: 'tài khoản nhân sự chưa kích hoạt hoặc chưa có mật khẩu',
};

// Kết quả của giao dịch cấp mã. Giao dịch TRẢ kết quả, lỗi nghiệp vụ chỉ được ném SAU khi nó kết thúc (cùng nếp với A5, A6, A8).
type Outcome =
  | { kind: 'refused'; id: string; refusal: PasswordResetRefusal }
  | { kind: 'limited'; failure: OtpFailure }
  | { kind: 'issued'; issued: IssuedOtp; recipient: Recipient };

/**
 * Quên mật khẩu (1) — cấp OTP, gửi lại, xác minh OTP để lấy resetToken (task A11; PLAN 5.1, quyết định S2, S4, Q6, N1; TRACKING A11-A…).
 *
 * `requestCode` (dùng chung cho `POST /auth/forgot-password` và `/resend-otp`, hành vi y hệt):
 *  1. đọc thường theo email (ngoài giao dịch); không có ⇒ EMAIL_CHUA_DANG_KY, không giao dịch, không OTP, không thư (QM-02);
 *  2. `OtpService.transaction` (READ COMMITTED, bắt buộc để nhiều tài khoản không deadlock chéo, A5-C): khoá hàng `tai_khoan` theo khoá chính,
 *     CHẠY LẠI các kiểm tra bằng dữ liệu mới nhất dưới khoá (tài khoản vừa bị xoá hoặc vừa quá 24 giờ), rồi `otp.issue` (giới hạn 60 giây và 5 mã/giờ
 *     riêng theo loại `QuenMatKhau`); thứ tự khoá cố định: `tai_khoan` rồi `ma_xac_thuc`;
 *  3. commit, rồi mới ném lỗi nghiệp vụ; gửi thư NGOÀI giao dịch (H9) tới email ĐÃ LƯU; N1 do OtpService lo (gửi lỗi ⇒ mã mới bị thu hồi, mã cũ còn dùng).
 *  Không đụng hàng `DangKy` nào: hai loại mã độc lập (thu hồi OTP đăng ký chỉ xảy ra ở A12, N3).
 *
 * `verifyCode`: `OtpService.verify` KHÔNG `consume` trên mã đã gửi mới nhất của tài khoản (đếm sai, kiểm hạn trước khi so, sai + quá hạn không đếm là của
 * A2), đúng thì cấp resetToken 10 phút TÍNH TỪ LÚC NÀY. OTP vẫn "chưa dùng" cho tới khi A12 đặt mật khẩu; `verify-otp` lặp lại cấp token mới. Không kiểm
 * lại tư cách tài khoản ở đây: A12 kiểm dưới khoá lúc đặt mật khẩu (quyết định Q7).
 *
 * Mọi mốc thời gian lấy từ `currentSecond()`; không dùng NOW() của DB. Log chỉ có mã tài khoản và mã hàng OTP: không email, OTP, token.
 */
@Injectable()
export class ForgotPasswordService {
  private readonly logger = new Logger(ForgotPasswordService.name);

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(TaiKhoanRepository) private readonly accounts: TaiKhoanRepository,
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(ResetTokenService) private readonly resetTokens: ResetTokenService,
  ) {}

  async requestCode(email: string): Promise<PasswordResetCodeResult> {
    const seen = await this.accounts.findForPasswordReset(
      this.dataSource.manager,
      email,
    );
    if (!seen) throw notRegistered();

    const outcome = await this.otp.transaction(async (em): Promise<Outcome> => {
      // Hàng có thể vừa bị xoá (job A7, đăng ký lại xoá lười) giữa lúc đọc và lúc khoá: coi như email chưa đăng ký, không phải lỗi hệ thống
      const locked = await this.accounts.findForPasswordResetForUpdate(
        em,
        seen.taiKhoanId,
      );
      if (!locked) {
        return {
          kind: 'refused',
          id: seen.taiKhoanId,
          refusal: 'NOT_REGISTERED',
        };
      }
      const refusal = passwordResetRefusalFor(locked, currentSecond());
      if (refusal) return { kind: 'refused', id: locked.taiKhoanId, refusal };

      const issued = await this.otp.issue(
        { taiKhoanId: locked.taiKhoanId, loai: 'QuenMatKhau' },
        { manager: em },
      );
      if (!issued.ok) return { kind: 'limited', failure: issued.failure };
      return {
        kind: 'issued',
        issued: issued.issued,
        // Thư gửi tới email ĐÃ LƯU trong tài khoản (như A5, A6), kèm họ tên cho lời chào
        recipient: { email: locked.email, fullName: locked.hoTen },
      };
    });

    if (outcome.kind === 'refused') {
      this.logger.warn(
        `Tài khoản ${outcome.id} không được cấp OTP quên mật khẩu: ${REFUSAL_LOG[outcome.refusal]}`,
      );
      throw outcome.refusal === 'NOT_REGISTERED'
        ? notRegistered()
        : pendingActivation();
    }
    if (outcome.kind === 'limited') throw toOtpException(outcome.failure);
    return deliverPasswordResetOtp(
      this.otp,
      this.logger,
      outcome.issued,
      outcome.recipient,
    );
  }

  async verifyCode(
    email: string,
    code: string,
  ): Promise<PasswordResetTokenResult> {
    const account = await this.accounts.findByEmail(
      this.dataSource.manager,
      email,
    );
    if (!account) throw toOtpException(UNKNOWN_ACCOUNT);

    const result = await this.otp.verify({
      taiKhoanId: account.taiKhoanId,
      loai: 'QuenMatKhau',
      otp: code,
    });
    if (!result.ok) throw toOtpException(result.failure);

    const { token, expiresAt } = await this.resetTokens.sign({
      taiKhoanId: result.otp.taiKhoanId,
      maXacThucId: result.otp.maXacThucId,
      issuedAt: currentSecond(),
    });
    this.logger.log(
      `Tài khoản ${result.otp.taiKhoanId} xác minh OTP quên mật khẩu đúng (mã xác thực ${result.otp.maXacThucId}): cấp resetToken`,
    );
    return { resetToken: token, hetHanLuc: expiresAt };
  }
}
