import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import {
  BOOKING_JOB_BATCH_SIZE,
  BOOKING_JOB_MAX_BATCHES,
} from '../../appointments/appointments.constants.js';
import { readClinicFooter } from '../../appointments/notifications/clinic-footer.query.js';
import { readNotificationContext } from '../../appointments/notifications/notification-context.query.js';
import { MailSendError } from '../../mail/mail-send.error.js';
import { MailService } from '../../mail/mail.service.js';
import { renderReminderMail } from './reminder-mail.templates.js';
import {
  REMINDER_MAX_ATTEMPTS,
  REMINDER_STALE_APPOINTMENT,
} from './reminder.constants.js';
import {
  claimReminder,
  freshReminder,
  insertReminder,
  isAppointmentStillDue,
  markFailed,
  markSent,
  releaseClaim,
  selectNewDue,
  selectRetryDue,
  START_CURSOR,
  type DueReminder,
  type ReminderCursor,
} from './reminder.query.js';

/** Tổng kết một lượt nhắc lịch (chỉ số lượng, không dữ liệu cá nhân). */
export interface ReminderSummary {
  /** Dòng `nhac_lich_hen` vừa tạo (mốc mới đến hạn) */
  created: number;
  /** Mốc mà bên khác đã tạo dòng trước (1062) */
  existing: number;
  /** Đã gửi và ghi `DaGui` */
  sent: number;
  /** Gửi hay dựng thư lỗi: ghi `ThatBai` (còn lượt thì lượt sau thử lại) */
  failed: number;
  /** Bên khác đã nhận việc trước: không gửi */
  lostClaim: number;
  /** Lịch hết hiệu lực khi kiểm lại sau nhận việc: ghi `ThatBai` `LICH_KHONG_CON_HIEU_LUC`, không gửi */
  dropped: number;
  /** Chưa có dòng `cau_hinh_he_thong`: không làm gì cả lượt */
  configMissing: boolean;
  /** Chưa cấu hình SMTP: đã trả hàng về như cũ và DỪNG cả lượt */
  notConfigured: boolean;
  /** Đã hết trần số lô: có thể còn mốc chờ lượt sau */
  more: boolean;
}

export const emptyReminderSummary = (): ReminderSummary => ({
  created: 0,
  existing: 0,
  sent: 0,
  failed: 0,
  lostClaim: 0,
  dropped: 0,
  configMissing: false,
  notConfigured: false,
  more: false,
});

/** Lịch đã nhận việc nhưng không đọc được dữ kiện thư (thiếu hàng nối: dữ liệu lệch). `reason` là chữ cố định ghi vào `loi_cuoi`. */
export class ReminderDataError extends Error {
  readonly reason = 'THIEU_LICH_HEN';
  constructor() {
    super('THIEU_LICH_HEN');
    this.name = 'ReminderDataError';
  }
}

/** Chữ ghi vào `loi_cuoi` và log: loại lỗi cố định, KHÔNG BAO GIỜ `message` (có thể chứa địa chỉ hay chữ của máy chủ SMTP; BTB-07). */
export function reminderFailureText(error: unknown): string {
  if (error instanceof MailSendError) return error.kind;
  if (error instanceof ReminderDataError) return error.reason;
  return error instanceof Error ? error.name : 'UNKNOWN';
}

type Step = 'next' | 'stop';

/**
 * Gửi thư nhắc lịch hẹn theo mốc cấu hình (notification B3; PLAN 5.6; 2.4.69). Mỗi lượt:
 *  1. đọc cấu hình (không có dòng ⇒ log cảnh báo, kết thúc lượt; không số ngầm, quy tắc 35);
 *  2. với MỖI mốc của `thoi_diem_nhac_lich`: tìm lịch có mốc vừa đến hạn (cửa sổ 10 phút), tạo dòng `(lịch, mốc)` rồi nhận việc và gửi;
 *  3. tìm dòng đang chờ hay cần thử lại (không phụ thuộc cấu hình hiện hành) rồi nhận việc và gửi.
 * Gửi một dòng: NHẬN VIỆC bằng `UPDATE` có điều kiện → KIỂM LẠI lịch (hết hiệu lực ⇒ `ThatBai` `LICH_KHONG_CON_HIEU_LUC`, không gửi) → dựng thư từ DB → `MailService.send` → ghi `DaGui` hay `ThatBai`.
 * Không có giao dịch nào bọc SMTP. KHÔNG ghi `thong_bao`, `email_thong_bao` hay nhật ký và KHÔNG đổi trạng thái lịch (2.4.75 b4; 2.4.69 HĐK thất bại).
 * Cả lượt dùng chung một ngân sách `BOOKING_JOB_MAX_BATCHES` lô × `BOOKING_JOB_BATCH_SIZE` (X1 M7: 1.000 thư ở 300 ms mỗi thư mất 358 giây, trong cửa sổ 10 phút).
 */
@Injectable()
export class AppointmentReminderService {
  private readonly logger = new Logger(AppointmentReminderService.name);

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(SystemConfigService) private readonly configs: SystemConfigService,
  ) {}

  /** Một lượt. `now` là MỘT mốc (đã cắt xuống giây) cho cả lượt; test đưa đồng hồ giả vào. */
  async sweep(now: Date, summary: ReminderSummary): Promise<void> {
    const config = await this.configs.get();
    if (config === null) {
      summary.configMissing = true;
      this.logger.warn(
        'Nhắc lịch: hệ thống chưa được cấu hình, bỏ qua lượt này',
      );
      return;
    }
    // Trần số lô của CẢ lượt (mốc mới và thử lại dùng chung); lô rỗng không tính, để các mốc không có lịch không ăn mất phần của mốc đang dồn (NLH-21)
    const budget = { left: BOOKING_JOB_MAX_BATCHES };
    // Mốc là CHÍNH số giờ (không phải vị trí trong mảng; NLH-16). Bỏ phần tử lạ và trùng cho chắc, dù DB đã có CHECK `chk_cau_hinh_nhac_lich`.
    const moc = [...new Set(config.thoiDiemNhacLich)].filter(
      (h) => Number.isInteger(h) && h >= 1,
    );
    for (const soGio of moc) {
      // Lô đầy thì có thể còn lịch: chọn tiếp (lịch đã xử lý có dòng nên câu sau không thấy lại)
      let full = true;
      while (full) {
        if (budget.left === 0) {
          summary.more = true;
          return;
        }
        const lich = await selectNewDue(this.db.manager, {
          now,
          soGio,
          limit: BOOKING_JOB_BATCH_SIZE,
        });
        if (lich.length > 0) budget.left -= 1;
        for (const lichHenId of lich)
          if ((await this.startNew(lichHenId, soGio, now, summary)) === 'stop')
            return;
        full = lich.length === BOOKING_JOB_BATCH_SIZE;
      }
    }
    await this.retryPending(now, budget, summary);
  }

  private async retryPending(
    now: Date,
    budget: { left: number },
    summary: ReminderSummary,
  ): Promise<void> {
    let after: ReminderCursor = START_CURSOR;
    let full = true;
    while (full) {
      if (budget.left === 0) {
        summary.more = true;
        return;
      }
      const due = await selectRetryDue(this.db.manager, {
        now,
        after,
        limit: BOOKING_JOB_BATCH_SIZE,
      });
      if (due.length > 0) budget.left -= 1;
      for (const reminder of due) {
        after = reminder;
        if ((await this.deliver(reminder, now, summary)) === 'stop') return;
      }
      full = due.length === BOOKING_JOB_BATCH_SIZE;
    }
  }

  private async startNew(
    lichHenId: string,
    soGio: number,
    now: Date,
    summary: ReminderSummary,
  ): Promise<Step> {
    if (!(await insertReminder(this.db.manager, lichHenId, soGio, now))) {
      summary.existing += 1;
      return 'next';
    }
    summary.created += 1;
    return this.deliver(freshReminder(lichHenId, soGio), now, summary);
  }

  private async deliver(
    reminder: DueReminder,
    now: Date,
    summary: ReminderSummary,
  ): Promise<Step> {
    const em = this.db.manager;
    if (!(await claimReminder(em, reminder, now))) {
      summary.lostClaim += 1;
      return 'next';
    }
    // Kiểm lại SAU khi nhận việc: lịch có thể vừa bị huỷ, đổi hay tới giờ hẹn giữa lúc chọn và lúc nhận (2.4.69 A1 3b, A2)
    if (!(await isAppointmentStillDue(em, reminder.lichHenId, now))) {
      await markFailed(em, reminder, REMINDER_STALE_APPOINTMENT);
      summary.dropped += 1;
      return 'next';
    }
    try {
      await this.mail.send(await this.buildMessage(reminder));
    } catch (error) {
      if (error instanceof MailSendError && error.kind === 'NOT_CONFIGURED') {
        await releaseClaim(em, reminder);
        summary.notConfigured = true;
        this.logger.warn(
          'Nhắc lịch: chưa cấu hình SMTP, giữ nguyên các mốc, không tính là lần thử',
        );
        return 'stop';
      }
      const loiCuoi = reminderFailureText(error);
      await markFailed(em, reminder, loiCuoi);
      summary.failed += 1;
      this.logger.warn(
        `Nhắc lịch ${reminder.lichHenId} mốc ${String(reminder.soGioTruoc)} giờ lỗi ở lần ${String(reminder.soLanThu + 1)}/${String(REMINDER_MAX_ATTEMPTS)}: ${loiCuoi}`,
      );
      return 'next';
    }
    // Đã gửi xong: lỗi ghi kết quả (DB sập) nổi lên cho job; hàng còn ở lần nhận việc này và được chọn lại sau nhịp 5 phút (thư có thể trùng, R6)
    await markSent(em, reminder, now);
    summary.sent += 1;
    return 'next';
  }

  // Người nhận là TÀI KHOẢN ĐẶT (`lich_hen.benh_nhan_id`), kể cả khi đặt hộ người thân (NLH-17)
  private async buildMessage(reminder: DueReminder) {
    const em = this.db.manager;
    const context = await readNotificationContext(em, reminder.lichHenId);
    if (context === null) throw new ReminderDataError();
    const rendered = renderReminderMail({
      context,
      soGio: reminder.soGioTruoc,
      footer: await readClinicFooter(em),
    });
    return { to: context.emailNguoiDat, ...rendered };
  }
}
