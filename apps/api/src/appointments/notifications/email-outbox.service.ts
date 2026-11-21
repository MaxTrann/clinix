import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MailSendError } from '../../mail/mail-send.error.js';
import { MailService, type MailMessage } from '../../mail/mail.service.js';
import {
  BOOKING_JOB_BATCH_SIZE,
  BOOKING_JOB_MAX_BATCHES,
  BOOKING_NOTIFICATION_EVENTS,
} from '../appointments.constants.js';
import {
  renderBookingConfirmationMail,
  renderCancellationMail,
  renderNoShowMail,
  renderNoShowRestrictionMail,
} from './booking-mail.templates.js';
import type { RenderedMail } from '../../mail/templates/otp-mail.js';
import { readClinicFooter } from './clinic-footer.query.js';
import {
  claimEmail,
  markFailed,
  markSent,
  readEmailPayload,
  releaseClaim,
  selectDueEmails,
  type DueEmail,
  type EmailPayload,
} from './email-outbox.query.js';
import {
  readNoShowFacts,
  readNotificationContext,
} from './notification-context.query.js';
import {
  BRANCH_CHANGE_MAIL_EVENTS,
  EMAIL_MAX_ATTEMPTS,
  PAYMENT_MAIL_EVENTS,
} from './notifications.constants.js';
import { readBranchChangeMailContext } from './branch-change-context.query.js';
import {
  renderBranchChangeAffectedMail,
  renderBranchChangeCancelledMail,
  renderBranchChangeRescheduledMail,
  renderBranchChangeResultMail,
} from './branch-change-mail.templates.js';
import {
  renderRefundMail,
  renderTopupFailedMail,
  renderWithdrawalApprovedMail,
  renderWithdrawalRejectedMail,
} from './payment-mail.templates.js';

const PAYMENT_MAIL_LOAI: ReadonlySet<string> = new Set(
  Object.values(PAYMENT_MAIL_EVENTS),
);
const BRANCH_CHANGE_MAIL_LOAI: ReadonlySet<string> = new Set(
  Object.values(BRANCH_CHANGE_MAIL_EVENTS),
);

/** Phần gốc của mã sự kiện: bỏ hậu tố phiên bản `:v{n}` của admin C4 (`ThayDoiChiNhanhAnhHuongLichHen:v2` ⇒ `ThayDoiChiNhanhAnhHuongLichHen`), khớp `SUBSTRING_INDEX` của câu chọn lô. */
export function baseEventOf(loai: string): string {
  return loai.split(':', 1)[0] ?? loai;
}

/** Tổng kết một lượt gửi (chỉ số lượng, không dữ liệu cá nhân). */
export interface EmailOutboxSummary {
  /** Đã gửi và ghi `DaGui` */
  sent: number;
  /** Gửi hay dựng thư lỗi: ghi `ThatBai` (còn lượt thì lượt sau thử lại) */
  failed: number;
  /** Bên khác đã nhận việc trước (hai bản API cùng chạy): không gửi */
  lostClaim: number;
  /** Chưa cấu hình SMTP: đã trả hàng về như cũ và DỪNG cả lượt */
  notConfigured: boolean;
  /** Có thể còn thư chưa tới lượt vì đã hết trần số lô */
  more: boolean;
}

export const emptyEmailOutboxSummary = (): EmailOutboxSummary => ({
  sent: 0,
  failed: 0,
  lostClaim: 0,
  notConfigured: false,
  more: false,
});

/** Lỗi dữ liệu khi dựng thư (không có dòng thông báo hay lịch hẹn, loại sự kiện lạ): chữ `reason` cố định là thứ ghi vào `loi_cuoi`. */
export class EmailOutboxDataError extends Error {
  constructor(
    readonly reason:
      | 'THIEU_THONG_BAO'
      | 'THIEU_LICH_HEN'
      | 'THIEU_YEU_CAU'
      | 'LOAI_SU_KIEN_LA',
  ) {
    super(reason);
    this.name = 'EmailOutboxDataError';
  }
}

/** Chữ ghi vào `loi_cuoi` và log: loại lỗi cố định, KHÔNG BAO GIỜ `message` của lỗi lạ (có thể chứa địa chỉ hay chữ của máy chủ SMTP). */
export function failureTextOf(error: unknown): string {
  if (error instanceof MailSendError) return error.kind;
  if (error instanceof EmailOutboxDataError) return error.reason;
  return error instanceof Error ? error.name : 'UNKNOWN';
}

/**
 * Gửi thư của hộp thư đi `email_thong_bao` (task B15; PLAN booking 5.12; TRACKING 3.37 B15-H). Mỗi lượt: chọn lô thư đến lượt (`selectDueEmails`), với MỖI thư: NHẬN VIỆC bằng `UPDATE` có điều kiện, dựng thư từ DB, `MailService.send`,
 * rồi ghi `DaGui` hay `ThatBai`. Không có giao dịch nào bọc lời gọi SMTP; lỗi gửi KHÔNG đụng `thong_bao` và lịch hẹn (đã commit từ trước, H12).
 *
 *  - Hai bản API cùng chạy: chỉ một bên nhận việc được mỗi thư (`claimEmail`), bên kia đếm `lostClaim`.
 *  - `NOT_CONFIGURED` (chưa có SMTP) không phải một lần thử: hàng về đúng giá trị cũ và cả lượt dừng, để thư không biến thành `ThatBai` hàng loạt trước khi có SMTP.
 *  - Tiến trình chết sau khi nhận việc: hàng được chọn lại sau `EMAIL_RETRY_GAP_MINUTES` phút (gửi ÍT NHẤT MỘT lần; thư có thể trùng nếu chết đúng giữa lúc SMTP nhận và lúc ghi `DaGui`: chấp nhận, ghi TECH_DEBT).
 *  - Log CHỈ có `email_thong_bao_id`, số lượng và loại lỗi cố định: không địa chỉ, tiêu đề hay nội dung (H12, TB-05).
 * Dữ liệu thư đọc TẠI LÚC GỬI (bảng `lich_hen` và bảng nối), riêng biến thể huỷ và câu hoàn lấy từ chính `thong_bao.noi_dung` (phương án P, B15-F); số lần vắng mặt và ngưỡng là số HIỆN TẠI (Figma `686:2`).
 */
@Injectable()
export class EmailOutboxService {
  private readonly logger = new Logger(EmailOutboxService.name);

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  /** Một lượt: tối đa `BOOKING_JOB_MAX_BATCHES` lô, mỗi lô `BOOKING_JOB_BATCH_SIZE` thư. `now` là MỘT mốc cho cả lượt (đồng hồ giả của test). */
  async sweep(now: Date, summary: EmailOutboxSummary): Promise<void> {
    let afterId = '0';
    for (let batch = 0; batch < BOOKING_JOB_MAX_BATCHES; batch++) {
      const due = await selectDueEmails(this.db.manager, {
        now,
        afterId,
        limit: BOOKING_JOB_BATCH_SIZE,
      });
      for (const email of due) {
        afterId = email.id;
        if ((await this.deliver(email, now, summary)) === 'stop') return;
      }
      if (due.length < BOOKING_JOB_BATCH_SIZE) return;
    }
    summary.more = true;
  }

  private async deliver(
    email: DueEmail,
    now: Date,
    summary: EmailOutboxSummary,
  ): Promise<'next' | 'stop'> {
    const em = this.db.manager;
    if (!(await claimEmail(em, email, now))) {
      summary.lostClaim += 1;
      return 'next';
    }
    try {
      await this.mail.send(await this.buildMessage(email));
    } catch (error) {
      if (error instanceof MailSendError && error.kind === 'NOT_CONFIGURED') {
        await releaseClaim(em, email);
        summary.notConfigured = true;
        this.logger.warn(
          'Chưa cấu hình SMTP: giữ các thư ở hàng đợi, không tính là lần thử',
        );
        return 'stop';
      }
      const loiCuoi = failureTextOf(error);
      await markFailed(em, email, loiCuoi);
      summary.failed += 1;
      this.logger.warn(
        `Gửi thư ${email.id} lỗi ở lần ${String(email.soLanThu + 1)}/${String(EMAIL_MAX_ATTEMPTS)}: ${loiCuoi}`,
      );
      return 'next';
    }
    // Đã gửi xong: lỗi ghi kết quả (DB sập) nổi lên cho job; hàng còn ở lần nhận việc này và được chọn lại sau nhịp (thư có thể trùng, B15-H)
    await markSent(em, email, now);
    summary.sent += 1;
    return 'next';
  }

  // Dựng thư từ DB tại lúc gửi. Thiếu dữ liệu là lỗi cố định (`EmailOutboxDataError`), thành `ThatBai` sau khi hết lượt thử.
  private async buildMessage(email: DueEmail): Promise<MailMessage> {
    const em = this.db.manager;
    const payload = await readEmailPayload(em, email.thongBaoId);
    if (payload === null) throw new EmailOutboxDataError('THIEU_THONG_BAO');
    const paymentMail = await this.renderPaymentMail(payload);
    if (paymentMail !== null) return { to: payload.email, ...paymentMail };
    const branchMail = await this.renderBranchChangeMail(payload);
    if (branchMail !== null) return { to: payload.email, ...branchMail };
    if (payload.lichHenId === null)
      throw new EmailOutboxDataError('THIEU_THONG_BAO');
    const context = await readNotificationContext(em, payload.lichHenId);
    if (context === null) throw new EmailOutboxDataError('THIEU_LICH_HEN');
    const common = {
      recipientName: payload.hoTen,
      context,
      footer: await readClinicFooter(em),
    };
    const rendered = await (async () => {
      switch (payload.loai) {
        case BOOKING_NOTIFICATION_EVENTS.CONFIRMED:
          return renderBookingConfirmationMail(common);
        case BOOKING_NOTIFICATION_EVENTS.CANCELLED:
          return renderCancellationMail({
            ...common,
            noiDung: payload.noiDung,
          });
        case BOOKING_NOTIFICATION_EVENTS.NO_SHOW:
          return renderNoShowMail({
            ...common,
            ...(await readNoShowFacts(em, payload.taiKhoanId)),
          });
        case BOOKING_NOTIFICATION_EVENTS.NO_SHOW_LOCK:
          return renderNoShowRestrictionMail({
            ...common,
            ...(await readNoShowFacts(em, payload.taiKhoanId)),
          });
        default:
          throw new EmailOutboxDataError('LOAI_SU_KIEN_LA');
      }
    })();
    return { to: payload.email, ...rendered };
  }

  /**
   * Thư của payment và wallet (payment B17): phần chi tiết là `thong_bao.noi_dung`, bảng chỉ có thời điểm ghi và trạng thái (`payment-mail.templates.ts`). Hai thư hoàn tiền cần `lich_hen_id`
   * để in mã lịch hẹn (thiếu ⇒ `THIEU_LICH_HEN`). `null` = không phải loại của payment, wallet (nhánh booking ở trên xử lý tiếp).
   */
  private async renderPaymentMail(
    payload: EmailPayload,
  ): Promise<RenderedMail | null> {
    if (!PAYMENT_MAIL_LOAI.has(payload.loai)) return null;
    const em = this.db.manager;
    const common = {
      recipientName: payload.hoTen,
      noiDung: payload.noiDung,
      thoiDiem: payload.thoiDiem,
      footer: await readClinicFooter(em),
    };
    const refund = async (special: boolean) => {
      const context =
        payload.lichHenId === null
          ? null
          : await readNotificationContext(em, payload.lichHenId);
      if (context === null) throw new EmailOutboxDataError('THIEU_LICH_HEN');
      return renderRefundMail({
        ...common,
        maLichHen: context.maLichHen,
        special,
      });
    };
    switch (payload.loai) {
      case PAYMENT_MAIL_EVENTS.TOPUP_FAILED:
        return renderTopupFailedMail(common);
      case PAYMENT_MAIL_EVENTS.DEPOSIT_REFUNDED:
        return refund(false);
      case PAYMENT_MAIL_EVENTS.SPECIAL_REFUND:
        return refund(true);
      case PAYMENT_MAIL_EVENTS.WITHDRAWAL_APPROVED:
        return renderWithdrawalApprovedMail(common);
      case PAYMENT_MAIL_EVENTS.WITHDRAWAL_REJECTED:
        return renderWithdrawalRejectedMail(common);
      default:
        return null;
    }
  }

  /**
   * Thư của yêu cầu thay đổi chi nhánh (admin C4): chi tiết là `thong_bao.noi_dung`, bảng có tên, địa chỉ chi nhánh và thời điểm hiệu lực đọc tại lúc gửi (`branch-change-mail.templates.ts`).
   * Thiếu `yeu_cau_thay_doi_chi_nhanh_id` hay yêu cầu không còn ⇒ `THIEU_YEU_CAU`. `null` = không phải loại của yêu cầu thay đổi chi nhánh.
   */
  private async renderBranchChangeMail(
    payload: EmailPayload,
  ): Promise<RenderedMail | null> {
    const base = baseEventOf(payload.loai);
    if (!BRANCH_CHANGE_MAIL_LOAI.has(base)) return null;
    const em = this.db.manager;
    const context =
      payload.yeuCauId === null
        ? null
        : await readBranchChangeMailContext(em, payload.yeuCauId);
    if (context === null) throw new EmailOutboxDataError('THIEU_YEU_CAU');
    const common = {
      recipientName: payload.hoTen,
      noiDung: payload.noiDung,
      thoiDiem: payload.thoiDiem,
      context,
      footer: await readClinicFooter(em),
    };
    switch (base) {
      case BRANCH_CHANGE_MAIL_EVENTS.RESULT:
        return renderBranchChangeResultMail(common);
      case BRANCH_CHANGE_MAIL_EVENTS.AFFECTED:
        return renderBranchChangeAffectedMail(common);
      case BRANCH_CHANGE_MAIL_EVENTS.RESCHEDULED:
        return renderBranchChangeRescheduledMail(common);
      case BRANCH_CHANGE_MAIL_EVENTS.CANCELLED:
        return renderBranchChangeCancelledMail(common);
      default:
        return null;
    }
  }
}
