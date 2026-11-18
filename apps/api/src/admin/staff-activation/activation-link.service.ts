import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, type EntityManager } from 'typeorm';
import { nowVN, toSecond } from '../../common/time/time.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { isDeadlockError } from '../../database/mysql-errors.js';
import { MailSendError } from '../../mail/mail-send.error.js';
import { MailService } from '../../mail/mail.service.js';
import {
  ActivationLinkRepository,
  type LockedAccount,
} from './activation-link.repository.js';
import { decideResend, type ResendPolicy } from './activation-link-rules.js';
import {
  buildActivationUrl,
  generateActivationToken,
  hashActivationToken,
} from './activation-link-token.js';
import type {
  ActivationRecipient,
  DeliverActivationLinkResult,
  IssueActivationLinkInput,
  IssueActivationLinkResult,
  StaffLoaiTaiKhoan,
  TransactionOptions,
} from './activation-link.types.js';
import { IssuedActivationLink } from './issued-activation-link.js';
import { renderStaffActivationMail } from './staff-activation-mail.js';
import {
  ACTIVATION_PHASE2_MAX_ATTEMPTS,
  ACTIVATION_RESEND_WINDOW_MS,
  MS_PER_HOUR,
  MS_PER_SECOND,
  STAFF_ACTIVATION_ERROR_CODES,
} from './staff-activation.constants.js';

/** Đồng hồ DUY NHẤT của dịch vụ: nowVN() của common/time (test dùng đồng hồ giả), cắt xuống giây. Không dùng NOW() của DB. */
const currentSecond = (): Date => toSecond(nowVN());

/** Tài khoản được cấp liên kết phải là NHÂN SỰ đang `ChoKichHoat`; trả vai trò nếu đúng, `null` nếu không (Bệnh nhân, đang hoạt động, đã ngưng). */
function pendingStaffRole(account: LockedAccount): StaffLoaiTaiKhoan | null {
  if (account.trangThai !== 'ChoKichHoat') return null;
  return account.loaiTaiKhoan === 'BenhNhan' ? null : account.loaiTaiKhoan;
}

/**
 * Liên kết kích hoạt nhân sự (task B14; PLAN admin 5.5; quyết định Q22, Q23, Q25; quy tắc nghiệp vụ 21 và ràng buộc 22). Dịch vụ dùng chung cho
 * B15 (tạo tài khoản, kind 'TaoMoi'), B20 (gửi lại, kind 'GuiLai'); B16 (kích hoạt công khai) dùng hàm thuần `deriveActivationLinkState`,
 * `hashActivationToken`, `activationTokenMatches`. KHÔNG có endpoint, không kiểm quyền admin, không ghi audit: đó là việc của người gọi.
 *
 * Quy trình cấp liên kết chia HAI PHA để không giữ giao dịch mở khi gọi SMTP (cùng mô hình OtpService của auth):
 *   pha 1 `issue`   : trong giao dịch của người gọi: khoá `tai_khoan`, kiểm là nhân sự ChoKichHoat, kiểm giới hạn gửi lại (Q23), sinh token, chèn hàng
 *                     "mới tạo" (da_gui_luc rỗng ⇒ chưa có hiệu lực). Người gọi commit.
 *   gửi thư         : `MailService.send` (NGOÀI mọi giao dịch).
 *   pha 2 `deliver` : gửi thành công ⇒ thu hồi các liên kết cũ chưa dùng RỒI đặt `da_gui_luc` (quy tắc 21; đảo thứ tự là vi phạm UNIQUE
 *                     `kich_hoat_dang_hieu_luc`); gửi lỗi ⇒ chỉ thu hồi CHÍNH hàng mới, liên kết cũ còn hạn GIỮ NGUYÊN.
 *
 * Thứ tự khoá cố định: hàng `tai_khoan` TRƯỚC, hàng `ma_xac_thuc` SAU, ở mọi đường, để không deadlock.
 * Giao dịch và cô lập (đã đo ở auth A5, xem TECH_DEBT 30): người gọi muốn gộp việc ghi của mình với `issue` PHẢI mở giao dịch bằng `transaction`
 * (READ COMMITTED), khi đó lần đọc quét khoảng để đếm giới hạn là đọc KHÔNG khoá. Giao dịch lạ vẫn đúng (đọc khoá) nhưng dễ deadlock và bị cảnh báo một lần.
 * Cửa sổ sự cố đã biết (cùng loại TECH_DEBT 21, 25 của OTP): thư đã đi mà ghi pha 2 lỗi (DB sập) thì hàng còn "mới tạo", liên kết trong thư chưa hiệu lực
 * và Admin phải "Gửi lại" (cách ≥ STAFF_ACTIVATION_RESEND_MIN_SECONDS).
 * Token và URL không bao giờ vào log, thông điệp lỗi hay phản hồi: chỉ nằm trong IssuedActivationLink (ẩn), thân thư và băm SHA-256 trong DB.
 */
@Injectable()
export class ActivationLinkService {
  private readonly logger = new Logger(ActivationLinkService.name);
  // Các EntityManager do `transaction` mở (READ COMMITTED): chỉ với chúng mới được đọc không khoá. WeakSet nên không giữ giao dịch đã xong.
  private readonly readCommittedManagers = new WeakSet<EntityManager>();
  private warnedForeignManager = false;

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(ActivationLinkRepository)
    private readonly repo: ActivationLinkRepository,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(ConfigService)
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /**
   * Mở giao dịch READ COMMITTED và đăng ký nó là giao dịch "chuẩn". CÁCH DÙNG CHUẨN khi người gọi cần ghi cùng giao dịch với `issue`
   * (B15 tạo tài khoản + hồ sơ, B20 kiểm quyền): truyền `em` làm `{ manager: em }`. Không tự thử lại khi deadlock (`work` của người gọi có thể có tác dụng phụ).
   */
  transaction<T>(work: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction('READ COMMITTED', (em) => {
      this.readCommittedManagers.add(em);
      return work(em);
    });
  }

  private inTransaction<T>(
    manager: EntityManager | undefined,
    work: (em: EntityManager) => Promise<T>,
  ): Promise<T> {
    return manager ? work(manager) : this.transaction(work);
  }

  // true = phải đọc KHOÁ (giao dịch lạ, không chắc mức cô lập); false = giao dịch READ COMMITTED do chính dịch vụ này mở, đọc không khoá
  private mustLockReads(em: EntityManager): boolean {
    return !this.readCommittedManagers.has(em);
  }

  // Giao dịch lạ gọi issue: vẫn đúng nhưng dễ deadlock chéo tài khoản; nhắc người viết dùng `transaction` (một lần cho mỗi dịch vụ)
  private warnIfForeignManager(em: EntityManager): void {
    if (this.warnedForeignManager || !this.mustLockReads(em)) return;
    this.warnedForeignManager = true;
    this.logger.warn(
      'issue được gọi trong giao dịch KHÔNG do ActivationLinkService.transaction mở: vẫn đúng (đọc khoá) nhưng dễ deadlock khi nhiều tài khoản ' +
        'cấp liên kết cùng lúc; hãy mở giao dịch bằng activationLinks.transaction (TECH_DEBT 30)',
    );
  }

  // Thử lại `work` tối đa ACTIVATION_PHASE2_MAX_ATTEMPTS lần khi MySQL báo deadlock (1213). Chỉ dùng cho việc idempotent mà làm lại từ đầu
  // không được nữa (pha 2 chạy sau khi thư đã gửi). Lỗi khác hoặc hết lần thì ném lại nguyên lỗi.
  private async retryOnDeadlock<T>(
    label: string,
    work: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await work();
      } catch (error) {
        if (
          !isDeadlockError(error) ||
          attempt >= ACTIVATION_PHASE2_MAX_ATTEMPTS
        ) {
          throw error;
        }
        this.logger.warn(
          `${label}: deadlock (1213) lần ${String(attempt)}/${String(ACTIVATION_PHASE2_MAX_ATTEMPTS)}, thử lại`,
        );
      }
    }
  }

  // Giới hạn gửi lại đọc từ cấu hình MỖI LẦN gọi (Q23), không lưu lại: đổi biến môi trường rồi khởi động lại là có hiệu lực
  private resendPolicy(): ResendPolicy {
    return {
      minIntervalMs:
        this.config.get('STAFF_ACTIVATION_RESEND_MIN_SECONDS', {
          infer: true,
        }) * MS_PER_SECOND,
      maxPerWindow: this.config.get('STAFF_ACTIVATION_RESEND_MAX_PER_HOUR', {
        infer: true,
      }),
      windowMs: ACTIVATION_RESEND_WINDOW_MS,
    };
  }

  // ------------------------------------------------------------------------------------------------ cấp liên kết

  /**
   * Pha 1: tạo liên kết mới ở trạng thái "mới tạo". Trả `ok: false` với `GUI_LAI_QUA_SOM` (kèm số giây phải chờ) nếu vi phạm giới hạn gửi lại,
   * hoặc `TAI_KHOAN_KHONG_CHO_KICH_HOAT` nếu tài khoản không phải nhân sự đang chờ kích hoạt. Tài khoản không tồn tại là lỗi lập trình của người
   * gọi (họ phải tải tài khoản trước) nên ném `Error`. Không đụng mạng.
   */
  issue(
    input: IssueActivationLinkInput,
    options: TransactionOptions = {},
  ): Promise<IssueActivationLinkResult> {
    return this.inTransaction(options.manager, (em) => this.issueIn(em, input));
  }

  private async issueIn(
    em: EntityManager,
    input: IssueActivationLinkInput,
  ): Promise<IssueActivationLinkResult> {
    const now = currentSecond();
    const account = await this.repo.lockAccount(em, input.taiKhoanId);
    if (!account) {
      throw new Error(
        `Không có tài khoản ${input.taiKhoanId} để cấp liên kết kích hoạt`,
      );
    }
    const role = pendingStaffRole(account);
    if (role === null) {
      return {
        ok: false,
        failure: {
          code: STAFF_ACTIVATION_ERROR_CODES.NOT_PENDING_STAFF,
          reason: 'NOT_PENDING_STAFF',
        },
      };
    }

    // Đếm cả hàng gửi lỗi và hàng bị thay (theo tao_luc, không theo da_gui_luc) dưới khoá tài khoản: hai yêu cầu cùng lúc xếp hàng ở khoá,
    // yêu cầu sau thấy hàng của yêu cầu trước. Giao dịch READ COMMITTED do `transaction` mở: đọc không khoá vẫn thấy hàng vừa commit.
    this.warnIfForeignManager(em);
    const createdAt = await this.repo.listCreatedSince(
      em,
      input.taiKhoanId,
      new Date(now.getTime() - ACTIVATION_RESEND_WINDOW_MS),
      this.mustLockReads(em),
    );
    const decision = decideResend(createdAt, now, this.resendPolicy());
    if (!decision.allowed) {
      return {
        ok: false,
        failure: {
          code: STAFF_ACTIVATION_ERROR_CODES.RESEND_TOO_SOON,
          reason: decision.reason,
          retryAfterSeconds: decision.retryAfterSeconds,
        },
      };
    }

    // TTL đọc MỖI LẦN gọi (NS-42): liên kết mới theo TTL mới, hàng cũ giữ het_han_luc đã lưu
    const ttlHours = this.config.get('STAFF_ACTIVATION_TTL_HOURS', {
      infer: true,
    });
    const hetHanLuc = new Date(now.getTime() + ttlHours * MS_PER_HOUR);
    const token = generateActivationToken();
    const maXacThucId = await this.repo.insert(em, {
      taiKhoanId: input.taiKhoanId,
      createdAt: now,
      expiresAt: hetHanLuc,
      maBam: hashActivationToken(token),
    });
    const url = buildActivationUrl(
      this.config.get('WEB_ORIGIN', { infer: true }),
      maXacThucId,
      token,
    );
    return {
      ok: true,
      issued: new IssuedActivationLink(
        {
          maXacThucId,
          taiKhoanId: input.taiKhoanId,
          kind: input.kind,
          loaiTaiKhoan: role,
          hetHanLuc,
          ttlHours,
        },
        url,
      ),
    };
  }

  // ------------------------------------------------------------------------------------------------ gửi thư và ghi kết quả

  /**
   * Pha 2: gửi thư rồi ghi kết quả. Gọi SAU KHI giao dịch của pha 1 đã commit. Chỉ gọi được MỘT lần cho mỗi IssuedActivationLink.
   *  - Thành công: thu hồi các liên kết cũ chưa dùng RỒI đặt `da_gui_luc` (xem recordSendSuccess); trả `ok: true`.
   *  - `MailSendError` (mọi loại): chỉ thu hồi CHÍNH hàng mới, giữ liên kết cũ còn hạn; trả `{ ok: false, maLoi: 'GUI_MAIL_LOI' }`, KHÔNG ném
   *    (B15 đặt vào `guiEmail` với HTTP 201; B20 báo gửi lỗi). Hàng vẫn tính vào giới hạn gửi lại.
   *  - Lỗi khác (lỗi lập trình, ví dụ dựng thư): cũng thu hồi hàng mới rồi ném lại nguyên lỗi.
   */
  async deliver(
    issued: IssuedActivationLink,
    recipient: ActivationRecipient,
  ): Promise<DeliverActivationLinkResult> {
    const url = IssuedActivationLink.revealForDelivery(issued);
    try {
      const rendered = renderStaffActivationMail({
        kind: issued.kind,
        fullName: recipient.fullName,
        accountEmail: recipient.email,
        loaiTaiKhoan: issued.loaiTaiKhoan,
        activationUrl: url,
        ttlHours: issued.ttlHours,
        supportAddress: this.config.get('MAIL_SUPPORT_ADDRESS', {
          infer: true,
        }),
      });
      await this.mail.send({ to: recipient.email, ...rendered });
    } catch (error) {
      await this.recordSendFailure(issued);
      if (error instanceof MailSendError) {
        // Chỉ ghi id hàng và loại lỗi: không email, không URL
        this.logger.warn(
          `Liên kết kích hoạt ${issued.maXacThucId} gửi lỗi (${error.kind}): đã thu hồi hàng mới, giữ liên kết cũ`,
        );
        return {
          ok: false,
          maLoi: STAFF_ACTIVATION_ERROR_CODES.MAIL_FAILED,
          maXacThucId: issued.maXacThucId,
        };
      }
      throw error;
    }
    await this.recordSendSuccess(issued);
    return {
      ok: true,
      maXacThucId: issued.maXacThucId,
      hetHanLuc: issued.hetHanLuc,
    };
  }

  // Pha 2 chạy SAU khi thư đã đi nên không làm lại từ đầu được: deadlock (1213) thì thử lại giao dịch (idempotent). Tối đa ACTIVATION_PHASE2_MAX_ATTEMPTS lần.
  private recordSendSuccess(issued: IssuedActivationLink): Promise<void> {
    return this.retryOnDeadlock(
      `Ghi kết quả gửi thành công của liên kết kích hoạt ${issued.maXacThucId}`,
      () =>
        this.transaction(async (em) => {
          await this.repo.lockAccount(em, issued.taiKhoanId);
          const now = currentSecond();
          // Hai lần gửi lại cách nhau ≥ 60 giây vẫn có thể hoàn tất ĐẢO THỨ TỰ (một lần gửi SMTP có thể kéo dài hơn 60 giây). Id mới nhất thắng.
          // Điều đó THỰC RA đã được bảo đảm bởi revokeOlderPending (thu hồi cả liên kết cũ CHƯA gửi khi liên kết mới thành công) cộng điều kiện
          // `thu_hoi_luc IS NULL` của markSent, nên nhánh dưới là PHÒNG THỦ CHỒNG TẦNG chứ không phải lý do duy nhất tránh vi phạm UNIQUE
          // (đột biến M25 chỉ bị test đơn vị bắt, test int và đua vẫn xanh; TRACKING admin 9A.2 mục 10.10, Đại chọn giữ nhánh 18/11/2026).
          // Nếu sau này revokeOlderPending bỏ sót hàng chưa gửi thì nhánh này vẫn chặn việc đặt da_gui_luc cho hàng đã bị thay thế.
          // Nếu đã có hàng MỚI HƠN gửi xong thì hàng này bị thay thế: thu hồi nó, KHÔNG đặt da_gui_luc.
          if (
            await this.repo.existsNewerSent(
              em,
              issued.taiKhoanId,
              issued.maXacThucId,
              this.mustLockReads(em),
            )
          ) {
            await this.repo.revokeUnsent(em, issued.maXacThucId, now);
            this.logger.warn(
              `Liên kết kích hoạt ${issued.maXacThucId} gửi xong nhưng đã có liên kết mới hơn được gửi: thu hồi, không đặt da_gui_luc`,
            );
            return;
          }
          // Quy tắc nghiệp vụ 21: thu hồi liên kết cũ chưa dùng (kể cả đã hết hạn) RỒI mới đặt da_gui_luc cho liên kết mới
          const revoked = await this.repo.revokeOlderPending(
            em,
            issued.taiKhoanId,
            issued.maXacThucId,
            now,
          );
          if (!(await this.repo.markSent(em, issued.maXacThucId, now))) {
            // Hàng đã bị thu hồi trong lúc gửi (một lần gửi mới hơn đã thành công trước và thu hồi nó): thư đã đi nhưng liên kết không dùng được
            this.logger.warn(
              `Liên kết kích hoạt ${issued.maXacThucId} gửi xong nhưng đã không còn hiệu lực: không đặt da_gui_luc`,
            );
            return;
          }
          this.logger.log(
            `Liên kết kích hoạt ${issued.maXacThucId} đã gửi; thu hồi ${String(revoked)} liên kết cũ`,
          );
        }),
    );
  }

  private async recordSendFailure(issued: IssuedActivationLink): Promise<void> {
    try {
      await this.retryOnDeadlock(
        `Ghi kết quả gửi lỗi của liên kết kích hoạt ${issued.maXacThucId}`,
        () =>
          this.transaction(async (em) => {
            await this.repo.lockAccount(em, issued.taiKhoanId);
            await this.repo.revokeUnsent(
              em,
              issued.maXacThucId,
              currentSecond(),
            );
          }),
      );
    } catch (recordError) {
      // Không để lỗi ghi nhận che mất lỗi gửi gốc
      this.logger.error(
        `Không ghi được kết quả gửi lỗi của liên kết kích hoạt ${issued.maXacThucId}`,
        recordError instanceof Error ? recordError.stack : undefined,
      );
    }
  }
}
