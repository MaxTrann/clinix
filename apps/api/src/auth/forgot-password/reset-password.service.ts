import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { RESET_PASSWORD_ERROR_CODES } from '../auth.constants.js';
import { currentSecond } from '../otp/otp-time.js';
import { OtpService } from '../otp/otp.service.js';
import type { ConsumeFailureReason } from '../otp/otp.types.js';
import { PasswordHasher } from '../password/password-hasher.service.js';
import { TaiKhoanRepository } from '../repositories/tai-khoan.repository.js';
import { SessionService } from '../session/session.service.js';
import {
  passwordResetRefusalFor,
  type PasswordResetRefusal,
} from './forgot-password-rules.js';
import { notRegistered, pendingActivation } from './forgot-password.service.js';
import {
  CONSUME_REFUSALS,
  resetFlagsFor,
  revokesRegistrations,
  type ResetPasswordFlags,
} from './reset-password-rules.js';
import {
  ResetTokenService,
  type ResetTokenClaims,
} from './reset-token.service.js';

export interface ResetPasswordInput {
  resetToken: string;
  /** Mật khẩu rõ, đã qua chính sách Q11 ở DTO: chỉ sống tới khi băm xong, không bao giờ được lưu, log hay đưa vào lỗi */
  matKhauMoi: string;
}

/** Thân phản hồi 200: đúng hai cờ cho khung "Hoàn tất" (N7, N3). */
export type ResetPasswordResult = ResetPasswordFlags;

const tokenExpired = (): AppException =>
  new AppException(403, RESET_PASSWORD_ERROR_CODES.TOKEN_EXPIRED, {
    thongBao:
      'Yêu cầu đặt lại mật khẩu đã hết hiệu lực. Vui lòng nhập email để nhận mã mới.',
  });

// Câu cố định ghi vào log cho từng lý do từ chối theo tư cách tài khoản (không bao giờ ghi email)
const REFUSAL_LOG: Record<PasswordResetRefusal, string> = {
  NOT_REGISTERED: 'Bệnh nhân chưa xác minh đã quá 24 giờ',
  PENDING_ACTIVATION: 'tài khoản nhân sự chưa kích hoạt hoặc chưa có mật khẩu',
};

// Kết quả của giao dịch. Mọi nhánh từ chối đứng TRƯỚC lần ghi đầu tiên; giao dịch vẫn TRẢ kết quả và lỗi nghiệp vụ chỉ được ném SAU khi nó kết thúc
// (cùng nếp A2, A8, A11). Lỗi bất ngờ sau một lần ghi thì cứ ném: cả giao dịch hoàn tác (QM-20).
type Outcome =
  | { kind: 'gone'; id: string } // tài khoản đã bị xoá sau khi cấp token (job A7, đăng ký lại xoá lười)
  | { kind: 'refused'; id: string; refusal: PasswordResetRefusal }
  | {
      kind: 'dead';
      id: string;
      maXacThucId: string;
      reason: ConsumeFailureReason;
    }
  | {
      kind: 'reset';
      id: string;
      maXacThucId: string;
      flags: ResetPasswordFlags;
      sessions: number;
      registrations: number;
    };

/**
 * POST /auth/reset-password — Quên mật khẩu (2), đặt mật khẩu mới (task A12; PLAN 5.1, quyết định S2, S4, Q6, Q8, N3, N6, N7; TRACKING A12-A…).
 *
 *  1. `ResetTokenService.verify` (A11; KHÔNG có bản kiểm thứ hai): token không dùng được ⇒ RESET_TOKEN_HET_HIEU_LUC, chưa băm, chưa chạm DB.
 *  2. Băm Argon2id mật khẩu mới NGOÀI giao dịch (≈ 20 ms CPU, như A8): không giữ khoá hay kết nối DB khi băm.
 *  3. `OtpService.transaction` (READ COMMITTED, bắt buộc để nhiều tài khoản không deadlock chéo, A5-C): khoá hàng `tai_khoan` theo khoá chính TRƯỚC,
 *     kiểm LẠI tư cách bằng dữ liệu mới nhất dưới khoá (A11 chỉ kiểm lúc cấp mã; trong 10 phút của token tài khoản có thể quá 24 giờ, về ChoKichHoat, bị
 *     xoá; NgungHoatDong vẫn được đặt), rồi `otp.consume` đúng hàng OTP của token (chưa dùng, chưa thu hồi; KHÔNG kiểm lại hạn của OTP, N6) — tới đây
 *     chưa ghi gì. Sau đó: mật khẩu mới + bộ đếm sai 0 + bỏ khoá tạm (S4), thu hồi MỌI phiên (Q8), và nếu chưa xác minh email thì thu hồi mọi mã DangKy
 *     chưa dùng và xoá dữ liệu đăng ký (N3; KHÔNG đặt cờ xác minh, KHÔNG tạo benh_nhan, Q6).
 *     Thứ tự khoá cố định: tai_khoan → ma_xac_thuc → phien_dang_nhap, cùng thứ tự với A2 đến A11 và admin B18.
 *  4. Sau commit mới ném lỗi nghiệp vụ hoặc trả hai cờ.
 * Mật khẩu mới sai dạng bị chặn ở DTO nên dịch vụ không chạy và token không bị tiêu thụ (QM-08). Không gửi thư nào.
 * Mọi mốc nghiệp vụ lấy từ `currentSecond()`; không dùng NOW() của DB. Log chỉ có mã tài khoản, mã xác thực và số đếm: không mật khẩu, băm, token, email.
 */
@Injectable()
export class ResetPasswordService {
  private readonly logger = new Logger(ResetPasswordService.name);

  constructor(
    @Inject(TaiKhoanRepository) private readonly accounts: TaiKhoanRepository,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(ResetTokenService) private readonly resetTokens: ResetTokenService,
  ) {}

  async reset(input: ResetPasswordInput): Promise<ResetPasswordResult> {
    // Token rác, giả hoặc hết hạn: không ghi log (không có gì đáng tin để ghi), không tốn một lần băm
    const claims = await this.resetTokens.verify(input.resetToken);
    if (!claims) throw tokenExpired();

    const matKhauBam = await this.hasher.hash(input.matKhauMoi);
    const outcome = await this.otp.transaction((em) =>
      this.apply(em, claims, matKhauBam),
    );
    return this.finish(outcome);
  }

  private async apply(
    em: EntityManager,
    { taiKhoanId: id, maXacThucId }: ResetTokenClaims,
    matKhauBam: string,
  ): Promise<Outcome> {
    const locked = await this.accounts.findForPasswordResetForUpdate(em, id);
    if (!locked) return { kind: 'gone', id };
    const refusal = passwordResetRefusalFor(locked, currentSecond());
    if (refusal) return { kind: 'refused', id, refusal };

    const consumed = await this.otp.consume(
      { maXacThucId, taiKhoanId: id, loai: 'QuenMatKhau' },
      { manager: em },
    );
    if (!consumed.ok) {
      return { kind: 'dead', id, maXacThucId, reason: consumed.reason };
    }

    // --- Từ đây mới ghi (da_dung_luc đã đặt ở trên, cùng giao dịch). Lỗi nào cũng hoàn tác trọn.
    if (!(await this.accounts.setPasswordAfterReset(em, id, matKhauBam))) {
      throw new Error(
        `Không ghi được mật khẩu mới của tài khoản ${id} dù đã khoá và kiểm điều kiện`,
      );
    }
    const sessions = await this.sessions.revokeAll(id, { manager: em });
    let registrations = 0;
    if (revokesRegistrations(locked)) {
      registrations = await this.otp.revokePending(id, 'DangKy', {
        manager: em,
      });
      await this.otp.clearRegistrationData(id, { manager: em });
    }
    return {
      kind: 'reset',
      id,
      maXacThucId,
      flags: resetFlagsFor(locked),
      sessions,
      registrations,
    };
  }

  // Chạy SAU khi giao dịch đã kết thúc
  private finish(outcome: Outcome): ResetPasswordResult {
    switch (outcome.kind) {
      case 'gone':
        this.logger.warn(
          `Tài khoản ${outcome.id} không còn khi đặt lại mật khẩu: từ chối resetToken`,
        );
        throw tokenExpired();
      case 'refused':
        this.logger.warn(
          `Tài khoản ${outcome.id} không được đặt lại mật khẩu: ${REFUSAL_LOG[outcome.refusal]}`,
        );
        throw outcome.refusal === 'NOT_REGISTERED'
          ? notRegistered()
          : pendingActivation();
      case 'dead': {
        const { expected, log } = CONSUME_REFUSALS[outcome.reason];
        const line = `Tài khoản ${outcome.id}: resetToken không dùng được (mã xác thực ${outcome.maXacThucId}: ${log})`;
        if (expected) this.logger.warn(line);
        else this.logger.error(`${line}; dữ liệu không nhất quán`);
        throw tokenExpired();
      }
      case 'reset':
        this.logger.log(
          `Tài khoản ${outcome.id} đặt lại mật khẩu (mã xác thực ${outcome.maXacThucId}): thu hồi ${String(outcome.sessions)} phiên, ` +
            `${String(outcome.registrations)} mã đăng ký`,
        );
        return outcome.flags;
    }
  }
}
