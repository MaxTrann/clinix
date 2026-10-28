import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { MailSendError } from '../../mail/mail-send.error.js';
import { MailService } from '../../mail/mail.service.js';
import { renderOtpMail } from '../../mail/templates/otp-mail.js';
import {
  OTP_MAX_WRONG_ATTEMPTS,
  OTP_TTL_MINUTES,
  OTP_TTL_MS,
  OTP_WINDOW_MS,
} from '../auth.constants.js';
import type { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import { MaXacThucRepository } from '../repositories/ma-xac-thuc.repository.js';
import { IssuedOtp } from './issued-otp.js';
import {
  generateOtpCode,
  hashOtp,
  isOtpFormat,
  otpMatches,
} from './otp-code.js';
import { OtpDeliveryError } from './otp-errors.js';
import {
  decideIssue,
  deriveOtpState,
  refusalFor,
  resendRefusalFor,
  statusLabelOf,
} from './otp-rules.js';
import { currentSecond } from './otp-time.js';
import type {
  ConsumeOtpResult,
  DeliveredOtp,
  IssueOtpInput,
  IssueOtpResult,
  OtpFailure,
  OtpLatestStatus,
  OtpLoai,
  Recipient,
  RegistrationData,
  TransactionOptions,
  VerifiedContext,
  VerifiedOtp,
  VerifyOtpInput,
  VerifyOtpResult,
} from './otp.types.js';

const fail = (failure: OtpFailure): { ok: false; failure: OtpFailure } => ({
  ok: false,
  failure,
});

function registrationOf(row: MaXacThuc): RegistrationData | null {
  if (
    row.hoTenDangKy === null ||
    row.soDienThoaiDangKy === null ||
    row.matKhauBamDangKy === null
  ) {
    return null;
  }
  return {
    hoTen: row.hoTenDangKy,
    soDienThoai: row.soDienThoaiDangKy,
    matKhauBam: row.matKhauBamDangKy,
  };
}

function toVerified(row: MaXacThuc): VerifiedOtp {
  return {
    maXacThucId: row.maXacThucId,
    taiKhoanId: row.taiKhoanId,
    loai: row.loai as OtpLoai,
    hetHanLuc: row.hetHanLuc,
    registration: registrationOf(row),
  };
}

/**
 * Mã OTP đăng ký / quên mật khẩu (task A2; quyết định S1, S3, N1, N2, N3, N6, G2). Đây là hợp đồng với A5, A6, A8, A11, A12.
 *
 * Quy trình cấp mã theo N1, chia HAI PHA để không giữ giao dịch mở khi gọi SMTP (H9):
 *   pha 1 `issue`   : trong giao dịch (của người gọi hoặc tự mở): khoá tài khoản, kiểm giới hạn gửi lại, chèn hàng, đặt HMAC. Commit.
 *   gửi thư         : `MailService.send` (ngoài mọi giao dịch).
 *   pha 2 `deliver` : gửi thành công ⇒ đặt `da_gui_luc` RỒI thu hồi các mã cũ; gửi lỗi ⇒ chỉ thu hồi chính hàng mới, giữ mã cũ.
 * `issueAndDeliver` gộp hai pha khi người gọi không có việc ghi nào khác chung giao dịch.
 *
 * Thứ tự khoá cố định: hàng `tai_khoan` TRƯỚC, hàng `ma_xac_thuc` SAU (cùng quy ước A3), ở mọi đường, để không deadlock.
 * Đồng hồ duy nhất: `nowVN()` của common/time cắt xuống giây; mọi mốc thời gian ghi tường minh từ đó, không dùng NOW() của DB.
 * OTP rõ không bao giờ vào log, thông điệp lỗi hay phản hồi: chỉ nằm trong IssuedOtp (ẩn), thân thư và băm HMAC trong DB.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly key: Buffer;

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(MaXacThucRepository) private readonly repo: MaXacThucRepository,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(ConfigService)
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.key = this.resolveKey();
  }

  // Khoá HMAC (S3). Đặt OTP_HMAC_SECRET thì dùng nó (validateEnv đã kiểm ≥ 32 ký tự và khác khoá JWT). Chưa đặt thì CHỈ ở
  // NODE_ENV=development mới dùng khoá ngẫu nhiên cho lần chạy này; ở test/staging/production là lỗi (validateEnv đã chặn từ lúc khởi động,
  // đây là lớp chặn thứ hai cho trường hợp tạo OtpService trực tiếp). Không bao giờ in giá trị khoá.
  private resolveKey(): Buffer {
    const configured = this.config.get('OTP_HMAC_SECRET', { infer: true });
    if (configured) return Buffer.from(configured, 'utf8');
    if (this.config.get('NODE_ENV', { infer: true }) === 'development') {
      this.logger.warn(
        'OTP_HMAC_SECRET chưa đặt: dùng khoá ngẫu nhiên cho lần chạy này, mã OTP đang chờ sẽ mất hiệu lực khi API khởi động lại ' +
          '(muốn ổn định thì đặt OTP_HMAC_SECRET trong .env)',
      );
      return randomBytes(32);
    }
    throw new Error('OTP_HMAC_SECRET: bắt buộc khi NODE_ENV khác development');
  }

  private inTransaction<T>(
    manager: EntityManager | undefined,
    work: (em: EntityManager) => Promise<T>,
  ): Promise<T> {
    return manager ? work(manager) : this.dataSource.transaction(work);
  }

  // ------------------------------------------------------------------------------------------------ cấp mã

  /**
   * Pha 1: cấp mã mới cho (tài khoản, loại). Quên mật khẩu: không cần `registration`; đăng ký: bắt buộc (dữ liệu của lần này).
   * Trả `GUI_LAI_QUA_SOM` (TOO_SOON hoặc HOURLY_LIMIT, kèm số giây phải chờ) nếu vi phạm giới hạn gửi lại. Không đụng mạng.
   */
  issue(
    input: IssueOtpInput,
    options: TransactionOptions = {},
  ): Promise<IssueOtpResult<IssuedOtp>> {
    return this.inTransaction(options.manager, (em) => this.issueIn(em, input));
  }

  /**
   * Pha 1 cho "Gửi lại mã" của đăng ký (A6): theo bảng trạng thái PLAN 5.2, sao chép dữ liệu đăng ký của hàng cũ sang hàng mới.
   * Từ chối hàng bị thay thế, phải đăng ký lại (N3), đã dùng. `expectedTaiKhoanId`: xem VerifyOtpInput.
   */
  async reissue(
    input: { maXacThucId: string; expectedTaiKhoanId?: string },
    options: TransactionOptions = {},
  ): Promise<IssueOtpResult<IssuedOtp>> {
    const reader = options.manager ?? this.dataSource.manager;
    const source = await this.repo.findById(reader, input.maXacThucId);
    if (!source) return fail({ code: 'OTP_SAI', reason: 'NOT_FOUND' });
    if (source.loai !== 'DangKy') {
      return fail({ code: 'OTP_SAI', reason: 'WRONG_TYPE' });
    }
    if (
      input.expectedTaiKhoanId !== undefined &&
      source.taiKhoanId !== input.expectedTaiKhoanId
    ) {
      return fail({ code: 'OTP_SAI', reason: 'WRONG_ACCOUNT' });
    }

    return this.inTransaction(options.manager, async (em) => {
      if (!(await this.repo.lockAccount(em, source.taiKhoanId))) {
        return fail({ code: 'OTP_SAI', reason: 'NOT_FOUND' });
      }
      const row = await this.repo.findByIdForUpdate(em, source.maXacThucId);
      if (!row) return fail({ code: 'OTP_SAI', reason: 'NOT_FOUND' });
      const replaced = await this.repo.existsNewerSentForUpdate(em, row);
      const state = deriveOtpState(row, currentSecond(), replaced);
      const refusal = resendRefusalFor(state);
      if (refusal) return fail(refusal);
      const registration = registrationOf(row);
      if (!registration) {
        return fail({ code: 'CAN_DANG_KY_LAI', reason: 'REGISTRATION_VOID' });
      }
      return this.issueIn(em, {
        taiKhoanId: row.taiKhoanId,
        loai: 'DangKy',
        registration,
      });
    });
  }

  private async issueIn(
    em: EntityManager,
    input: IssueOtpInput,
  ): Promise<IssueOtpResult<IssuedOtp>> {
    const now = currentSecond();
    if (!(await this.repo.lockAccount(em, input.taiKhoanId))) {
      throw new Error(`Không có tài khoản ${input.taiKhoanId} để cấp OTP`);
    }

    // Đếm cả hàng gửi lỗi (theo tao_luc, không theo da_gui_luc) dưới khoá tài khoản: hai yêu cầu cùng lúc xếp hàng ở khoá,
    // yêu cầu sau thấy hàng của yêu cầu trước (DK-28)
    const createdAt = await this.repo.listCreatedSinceForUpdate(
      em,
      input.taiKhoanId,
      input.loai,
      new Date(now.getTime() - OTP_WINDOW_MS),
    );
    const decision = decideIssue(createdAt, now);
    if (!decision.allowed) {
      return fail({
        code: 'GUI_LAI_QUA_SOM',
        reason: decision.reason,
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }

    const hetHanLuc = new Date(now.getTime() + OTP_TTL_MS);
    const maXacThucId = await this.repo.insert(em, {
      taiKhoanId: input.taiKhoanId,
      loai: input.loai,
      createdAt: now,
      expiresAt: hetHanLuc,
      registration: input.loai === 'DangKy' ? input.registration : null,
    });
    // HMAC gồm cả ma_xac_thuc_id nên chỉ đặt được sau khi chèn để có id (cùng giao dịch)
    const code = generateOtpCode();
    await this.repo.setHash(
      em,
      maXacThucId,
      hashOtp(this.key, {
        taiKhoanId: input.taiKhoanId,
        loai: input.loai,
        maXacThucId,
        code,
      }),
    );
    return {
      ok: true,
      issued: new IssuedOtp(
        {
          maXacThucId,
          taiKhoanId: input.taiKhoanId,
          loai: input.loai,
          hetHanLuc,
        },
        code,
      ),
    };
  }

  /**
   * Pha 2: gửi thư rồi ghi kết quả. Gọi SAU KHI giao dịch của pha 1 đã commit.
   *  - Thành công: đặt `da_gui_luc` RỒI thu hồi các mã cũ hơn chưa dùng (N1).
   *  - `MailSendError`: thu hồi chính hàng mới (giữ mã cũ nếu còn hạn), hàng vẫn tính vào giới hạn gửi lại; ném `OtpDeliveryError`
   *    (là MailSendError, mang `maXacThucId` để FE "Gửi lại mã" bằng chính mã đó).
   *  - Lỗi khác (lỗi lập trình): cũng thu hồi hàng mới rồi ném lại nguyên lỗi.
   * Chỉ gọi được MỘT lần cho mỗi IssuedOtp.
   */
  async deliver(issued: IssuedOtp, recipient: Recipient): Promise<void> {
    const code = IssuedOtp.revealForDelivery(issued);
    try {
      const rendered =
        issued.loai === 'DangKy'
          ? renderOtpMail({
              kind: 'register',
              otp: code,
              expiresInMinutes: OTP_TTL_MINUTES,
              fullName: recipient.fullName,
              supportAddress: this.config.get('MAIL_SUPPORT_ADDRESS', {
                infer: true,
              }),
            })
          : renderOtpMail({
              kind: 'forgot-password',
              otp: code,
              expiresInMinutes: OTP_TTL_MINUTES,
              fullName: recipient.fullName,
              accountEmail: recipient.email,
              supportAddress: this.config.get('MAIL_SUPPORT_ADDRESS', {
                infer: true,
              }),
            });
      await this.mail.send({ to: recipient.email, ...rendered });
    } catch (error) {
      await this.recordSendFailure(issued);
      if (error instanceof MailSendError) {
        throw new OtpDeliveryError(error, issued.maXacThucId);
      }
      throw error;
    }
    await this.recordSendSuccess(issued);
  }

  /** Gộp pha 1 và pha 2 (A6 gửi lại, A11 quên mật khẩu). Lỗi giới hạn trả về `ok: false`; lỗi gửi thư ném `OtpDeliveryError`. */
  async issueAndDeliver(
    input: IssueOtpInput,
    recipient: Recipient,
  ): Promise<IssueOtpResult<DeliveredOtp>> {
    const result = await this.issue(input);
    if (!result.ok) return result;
    await this.deliver(result.issued, recipient);
    return {
      ok: true,
      issued: {
        maXacThucId: result.issued.maXacThucId,
        hetHanLuc: result.issued.hetHanLuc,
      },
    };
  }

  private async recordSendSuccess(issued: IssuedOtp): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      await this.repo.lockAccount(em, issued.taiKhoanId);
      const now = currentSecond();
      if (!(await this.repo.markSent(em, issued.maXacThucId, now))) {
        // Hàng đã bị thu hồi/đã dùng trong lúc gửi (ví dụ một lần gửi mới hơn đã thành công trước): thư đã đi nhưng mã không dùng được
        this.logger.warn(
          `Mã OTP ${issued.maXacThucId} gửi xong nhưng đã không còn hiệu lực: không đặt da_gui_luc`,
        );
        return;
      }
      const revoked = await this.repo.revokeOlderPending(
        em,
        issued.taiKhoanId,
        issued.loai,
        issued.maXacThucId,
        now,
      );
      this.logger.log(
        `Mã OTP ${issued.maXacThucId} đã gửi; thu hồi ${String(revoked)} mã cũ`,
      );
    });
  }

  private async recordSendFailure(issued: IssuedOtp): Promise<void> {
    try {
      await this.dataSource.transaction(async (em) => {
        await this.repo.lockAccount(em, issued.taiKhoanId);
        await this.repo.revokeUnsent(em, issued.maXacThucId, currentSecond());
      });
      this.logger.warn(
        `Mã OTP ${issued.maXacThucId} gửi lỗi: đã thu hồi mã mới, giữ mã cũ`,
      );
    } catch (recordError) {
      // Không để lỗi ghi nhận che mất lỗi gửi gốc
      this.logger.error(
        `Không ghi được kết quả gửi lỗi của mã OTP ${issued.maXacThucId}`,
        recordError instanceof Error ? recordError.stack : undefined,
      );
    }
  }

  // ------------------------------------------------------------------------------------------------ xác minh

  /**
   * Xác minh mã người dùng nhập. Luôn tự mở giao dịch RIÊNG (không nhận giao dịch của người gọi): kết quả sai được trả về bình thường
   * và COMMIT cùng lần đếm sai; nếu chạy trong giao dịch của người gọi rồi họ ném lỗi thì lần đếm sai bị ROLLBACK và kẻ tấn công thử vô hạn.
   *
   * Thứ tự kiểm (PLAN 5.2, S3, D5): hàng có tồn tại, đúng loại, đúng tài khoản mong đợi → khoá tài khoản rồi khoá hàng → trạng thái
   * (đã dùng/chưa gửi: OTP_SAI không đếm; phải đăng ký lại; bị thay thế; thu hồi do sai: HET_LUOT; **hết hạn: HET_HAN, KHÔNG đếm kể cả
   * mã sai**) → so mã bằng so sánh thời gian hằng định → sai thì đếm nguyên tử, đủ 5 lần thì thu hồi.
   *
   * Đúng: nếu `consume` thì đặt `da_dung_luc`, rồi chạy `onVerified` TRONG CÙNG giao dịch (ghi tài khoản, benh_nhan, ví…). `onVerified`
   * ném lỗi thì cả giao dịch rollback, kể cả việc đánh dấu đã dùng.
   */
  verify(
    input: VerifyOtpInput,
    options?: { consume?: boolean },
  ): Promise<VerifyOtpResult<undefined>>;
  verify<T>(
    input: VerifyOtpInput,
    options: { consume?: boolean },
    onVerified: (context: VerifiedContext) => Promise<T>,
  ): Promise<VerifyOtpResult<T>>;
  async verify<T>(
    input: VerifyOtpInput,
    options: { consume?: boolean } = {},
    onVerified?: (context: VerifiedContext) => Promise<T>,
  ): Promise<VerifyOtpResult<T | undefined>> {
    // Bước đọc thường NGOÀI giao dịch để biết hàng thuộc tài khoản nào (cần khoá tài khoản trước khi khoá hàng)
    let accountId: string;
    if ('maXacThucId' in input) {
      const peek = await this.repo.findById(
        this.dataSource.manager,
        input.maXacThucId,
      );
      if (!peek) return fail({ code: 'OTP_SAI', reason: 'NOT_FOUND' });
      if (peek.loai !== input.loai) {
        return fail({ code: 'OTP_SAI', reason: 'WRONG_TYPE' });
      }
      accountId = peek.taiKhoanId;
    } else {
      accountId = input.taiKhoanId;
    }
    if (
      input.expectedTaiKhoanId !== undefined &&
      accountId !== input.expectedTaiKhoanId
    ) {
      return fail({ code: 'OTP_SAI', reason: 'WRONG_ACCOUNT' });
    }

    return this.dataSource.transaction(
      async (em): Promise<VerifyOtpResult<T | undefined>> => {
        if (!(await this.repo.lockAccount(em, accountId))) {
          return fail({ code: 'OTP_SAI', reason: 'NOT_FOUND' });
        }
        const row =
          'maXacThucId' in input
            ? await this.repo.findByIdForUpdate(em, input.maXacThucId)
            : await this.repo.findLatestSentForUpdate(
                em,
                accountId,
                input.loai,
              );
        if (!row || row.taiKhoanId !== accountId || row.loai !== input.loai) {
          return fail({ code: 'OTP_SAI', reason: 'NOT_FOUND' });
        }

        const now = currentSecond();
        const replaced = await this.repo.existsNewerSentForUpdate(em, row);
        const refusal = refusalFor(deriveOtpState(row, now, replaced));
        if (refusal) return fail(refusal);

        const matched =
          isOtpFormat(input.otp) &&
          otpMatches(row.maBam, this.key, {
            taiKhoanId: row.taiKhoanId,
            loai: input.loai,
            maXacThucId: row.maXacThucId,
            code: input.otp,
          });
        if (!matched) return this.countWrongAttempt(em, row, now);

        if (
          options.consume &&
          !(await this.repo.markUsed(em, row.maXacThucId, now))
        ) {
          throw new Error(
            `Không đánh dấu đã dùng được mã OTP ${row.maXacThucId} dù đã khoá hàng`,
          );
        }
        const otp = toVerified(row);
        const value = onVerified
          ? await onVerified({ manager: em, otp, now })
          : undefined;
        return { ok: true, otp, value };
      },
    );
  }

  private async countWrongAttempt(
    em: EntityManager,
    row: MaXacThuc,
    now: Date,
  ): Promise<{ ok: false; failure: OtpFailure }> {
    if (
      !(await this.repo.recordWrongAttempt(
        em,
        row.maXacThucId,
        OTP_MAX_WRONG_ATTEMPTS,
        now,
      ))
    ) {
      throw new Error(
        `Không ghi được lần nhập sai của mã OTP ${row.maXacThucId} dù đã khoá hàng`,
      );
    }
    const wrongAttempts = row.soLanNhapSai + 1;
    if (wrongAttempts >= OTP_MAX_WRONG_ATTEMPTS) {
      this.logger.warn(
        `Mã OTP ${row.maXacThucId} bị thu hồi sau ${String(wrongAttempts)} lần nhập sai`,
      );
      return fail({
        code: 'OTP_HET_LUOT',
        reason: 'ATTEMPTS_EXHAUSTED',
        wrongAttempts,
      });
    }
    this.logger.warn(
      `Mã OTP ${row.maXacThucId} nhập sai lần ${String(wrongAttempts)}/${String(OTP_MAX_WRONG_ATTEMPTS)}`,
    );
    return fail({ code: 'OTP_SAI', reason: 'WRONG_CODE', wrongAttempts });
  }

  /**
   * Đặt `da_dung_luc` cho hàng OTP gắn với `resetToken` khi đặt mật khẩu (A12; S2, N6): hàng phải thuộc đúng tài khoản và loại, đã gửi,
   * CHƯA dùng, CHƯA thu hồi; KHÔNG kiểm lại hạn của OTP (hạn của resetToken do TokenService kiểm). Chạy trong giao dịch của người
   * gọi (`manager` bắt buộc) để cùng commit với việc đổi mật khẩu; thứ tự khoá vẫn tài khoản trước, hàng sau.
   */
  async consume(
    input: { maXacThucId: string; taiKhoanId: string; loai: OtpLoai },
    options: { manager: EntityManager },
  ): Promise<ConsumeOtpResult> {
    const em = options.manager;
    if (!(await this.repo.lockAccount(em, input.taiKhoanId))) {
      return { ok: false, reason: 'NOT_FOUND' };
    }
    const row = await this.repo.findByIdForUpdate(em, input.maXacThucId);
    if (!row) return { ok: false, reason: 'NOT_FOUND' };
    if (row.taiKhoanId !== input.taiKhoanId) {
      return { ok: false, reason: 'WRONG_ACCOUNT' };
    }
    if (row.loai !== input.loai) return { ok: false, reason: 'WRONG_TYPE' };
    if (row.daDungLuc !== null) return { ok: false, reason: 'USED' };
    if (row.thuHoiLuc !== null) return { ok: false, reason: 'REVOKED' };
    if (row.daGuiLuc === null) return { ok: false, reason: 'NOT_SENT' };
    if (!(await this.repo.markUsed(em, row.maXacThucId, currentSecond()))) {
      throw new Error(
        `Không đánh dấu đã dùng được mã OTP ${row.maXacThucId} dù đã khoá hàng`,
      );
    }
    return { ok: true };
  }

  // ------------------------------------------------------------------------------------------------ thu hồi, dọn, trạng thái

  /**
   * Thu hồi mọi mã chưa dùng, chưa thu hồi của (tài khoản, loại). Trả số mã vừa bị thu hồi.
   * Người gọi đã khoá hàng tai_khoan trong `manager` (A6 sau khi xác minh, A12 khi đặt lại mật khẩu trên tài khoản chưa xác minh, N3).
   */
  revokePending(
    taiKhoanId: string,
    loai: OtpLoai,
    options: { manager: EntityManager },
  ): Promise<number> {
    return this.repo.revokePending(
      options.manager,
      taiKhoanId,
      loai,
      currentSecond(),
    );
  }

  /** Đặt NULL ba cột dữ liệu đăng ký của MỌI hàng DangKy của tài khoản (DK-45; N3: để không "gửi lại" được dữ liệu cũ). */
  clearRegistrationData(
    taiKhoanId: string,
    options: { manager: EntityManager },
  ): Promise<number> {
    return this.repo.clearRegistrationData(options.manager, taiKhoanId);
  }

  /**
   * Trạng thái của mã mới nhất cho đáp ứng đăng nhập chưa xác minh (PLAN 5.3, N2): hàng đã gửi thành công mới nhất; nếu chưa có hàng
   * nào đã gửi thì hàng mới nhất. `null` nếu chưa từng có hàng. Đọc thường, chỉ để hiển thị.
   */
  async latestStatus(
    taiKhoanId: string,
    loai: OtpLoai,
    options: TransactionOptions = {},
  ): Promise<OtpLatestStatus | null> {
    const em = options.manager ?? this.dataSource.manager;
    const row =
      (await this.repo.findLatestSent(em, taiKhoanId, loai)) ??
      (await this.repo.findLatest(em, taiKhoanId, loai));
    if (!row) return null;
    // Hàng đã gửi mới nhất thì không thể bị thay thế; không có hàng nào đã gửi thì cũng không có gì thay thế nó
    const state = deriveOtpState(row, currentSecond(), false);
    return {
      maXacThucId: row.maXacThucId,
      trangThaiMa: statusLabelOf(state),
      hetHanLuc: row.hetHanLuc,
    };
  }
}
