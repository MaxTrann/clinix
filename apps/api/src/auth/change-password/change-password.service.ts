import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import {
  AUTH_ERROR_CODES,
  CHANGE_PASSWORD_ERROR_CODES,
} from '../auth.constants.js';
import { OtpService } from '../otp/otp.service.js';
import { PasswordHasher } from '../password/password-hasher.service.js';
import { TaiKhoanRepository } from '../repositories/tai-khoan.repository.js';
import { SessionService } from '../session/session.service.js';

export interface ChangePasswordInput {
  /** Hai mã từ access token (guard A4), không bao giờ từ thân yêu cầu */
  accountId: string;
  sessionId: string;
  /** Mật khẩu rõ: chỉ sống tới khi so và băm xong, không bao giờ được lưu, log hay đưa vào lỗi */
  matKhauCu: string;
  matKhauMoi: string;
}

/** Controller chỉ đưa hai giá trị này vào cookie, không vào thân phản hồi. */
export interface ChangePasswordResult {
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

// Kết quả của giao dịch. Mọi nhánh từ chối đứng TRƯỚC lần ghi đầu tiên; lỗi nghiệp vụ chỉ ném SAU khi giao dịch kết thúc (cùng nếp A2, A8, A12).
// Lỗi bất ngờ thì cứ ném: cả giao dịch hoàn tác.
type Outcome =
  | { kind: 'session-lost'; reason: string } // tài khoản hoặc phiên chết trong lúc băm
  | { kind: 'password-changed' } // mật khẩu vừa đổi (đổi hoặc đặt lại song song): mật khẩu đã so là của băm cũ
  | { kind: 'changed'; result: ChangePasswordResult; revokedSessions: number };

const wrongCurrentPassword = (): AppException =>
  new AppException(400, CHANGE_PASSWORD_ERROR_CODES.WRONG_CURRENT_PASSWORD, {
    thongBao: 'Mật khẩu hiện tại không đúng.',
  });

const sessionInactive = (): UnauthorizedException =>
  new UnauthorizedException(AUTH_ERROR_CODES.SESSION_INACTIVE);

/**
 * POST /auth/change-password — Đổi mật khẩu (task A13; PLAN 5.1, 5.3, quyết định Q8, S7; TRACKING A13-A…). Cần đăng nhập: tài khoản và phiên lấy từ access token.
 *
 *  1. Đọc THƯỜNG băm hiện tại, so mật khẩu cũ. Sai ⇒ 400 MAT_KHAU_CU_SAI: không mở giao dịch, không ghi, KHÔNG đếm `so_lan_dang_nhap_sai` (DM-08), không băm thêm.
 *  2. Băm mật khẩu mới. Cả hai lần Argon2id (mỗi lần ≈ 20 ms CPU) nằm NGOÀI giao dịch: không giữ khoá hay kết nối DB khi băm (như A8, A12).
 *  3. `otp.transaction` (READ COMMITTED, không khoá khoảng, A5-C): khoá hàng `tai_khoan` TRƯỚC, kiểm LẠI
 *     dưới khoá (còn DangHoatDong; băm còn là băm đã so), rồi `rotateRefreshToken` phiên hiện tại. Lệnh này vừa kiểm phiên (chưa thu hồi, chưa quá trần) vừa là lần ghi đầu
 *     tiên, nên đặt trước để phiên đã chết bị từ chối khi chưa ghi gì. Sau đó ghi mật khẩu mới, rồi thu hồi MỌI phiên KHÁC (Q8).
 *     Thứ tự khoá `tai_khoan` → `phien_dang_nhap`. Ghi `thu_hoi_luc` kéo khoá S lên hàng `tai_khoan`, nên mọi nơi ghi cột đó đều phải khoá `tai_khoan` trước (xem đầu TaiKhoanRepository).
 *  4. Sau commit mới ném lỗi nghiệp vụ hoặc trả token mới cho controller đặt cookie.
 * Không chặn mật khẩu mới trùng mật khẩu cũ (như A12). Không đụng `ma_xac_thuc`, không gửi thư. Log chỉ có mã tài khoản, mã phiên và số phiên: không mật khẩu, băm, token, email.
 */
@Injectable()
export class ChangePasswordService {
  private readonly logger = new Logger(ChangePasswordService.name);

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(TaiKhoanRepository) private readonly accounts: TaiKhoanRepository,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async change(input: ChangePasswordInput): Promise<ChangePasswordResult> {
    const { accountId, sessionId } = input;
    const account = await this.accounts.findForPasswordChange(
      this.dataSource.manager,
      accountId,
    );
    if (account?.trangThai !== 'DangHoatDong' || !account.matKhauBam) {
      return this.finish(input, {
        kind: 'session-lost',
        reason: 'tài khoản không còn hoạt động',
      });
    }

    const matched = await this.hasher.verify(
      account.matKhauBam,
      input.matKhauCu,
    );
    if (!matched) {
      this.logger.warn(
        `Tài khoản ${accountId} (phiên ${sessionId}) nhập sai mật khẩu hiện tại khi đổi mật khẩu`,
      );
      throw wrongCurrentPassword();
    }

    const matKhauBam = await this.hasher.hash(input.matKhauMoi);
    const outcome = await this.otp.transaction((em) =>
      this.apply(em, input, account.matKhauBam ?? '', matKhauBam),
    );
    return this.finish(input, outcome);
  }

  private async apply(
    em: EntityManager,
    { accountId, sessionId }: ChangePasswordInput,
    verifiedHash: string,
    newHash: string,
  ): Promise<Outcome> {
    const locked = await this.accounts.findForLoginForUpdate(em, accountId);
    if (locked?.trangThai !== 'DangHoatDong') {
      return { kind: 'session-lost', reason: 'tài khoản không còn hoạt động' };
    }
    if (locked.matKhauBam !== verifiedHash) return { kind: 'password-changed' };

    const rotated = await this.sessions.rotateRefreshToken(sessionId, {
      manager: em,
    });
    if (!rotated) {
      return { kind: 'session-lost', reason: 'phiên không còn hiệu lực' };
    }

    // --- Từ đây đã ghi (băm refresh token mới). Lỗi nào cũng hoàn tác trọn.
    if (!(await this.accounts.setPasswordAfterChange(em, accountId, newHash))) {
      throw new Error(
        `Không ghi được mật khẩu mới của tài khoản ${accountId} dù đã khoá và kiểm điều kiện`,
      );
    }
    const revokedSessions = await this.sessions.revokeAll(accountId, {
      manager: em,
      exceptSessionId: sessionId,
    });
    return { kind: 'changed', result: rotated, revokedSessions };
  }

  // Chạy SAU khi giao dịch đã kết thúc
  private finish(
    { accountId, sessionId }: ChangePasswordInput,
    outcome: Outcome,
  ): ChangePasswordResult {
    switch (outcome.kind) {
      case 'session-lost':
        this.logger.warn(
          `Tài khoản ${accountId} (phiên ${sessionId}) không đổi được mật khẩu: ${outcome.reason}`,
        );
        throw sessionInactive();
      case 'password-changed':
        this.logger.warn(
          `Tài khoản ${accountId} (phiên ${sessionId}) không đổi được mật khẩu: mật khẩu vừa được đổi bởi yêu cầu khác`,
        );
        throw wrongCurrentPassword();
      case 'changed':
        this.logger.log(
          `Tài khoản ${accountId} đổi mật khẩu (phiên ${sessionId}): thu hồi ${String(outcome.revokedSessions)} phiên khác`,
        );
        return outcome.result;
    }
  }
}
