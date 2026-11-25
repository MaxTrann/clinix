import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { nowVN, toSecond } from '../../common/time/time.js';
import {
  AppointmentReminderService,
  emptyReminderSummary,
  reminderFailureText,
  type ReminderSummary,
} from './appointment-reminder.service.js';
import { REMINDER_CRON, REMINDER_JOB_NAME } from './reminder.constants.js';

/**
 * Job nhắc lịch hẹn (notification B3; PLAN 5.6). Lớp chạy theo lịch MỎNG, đúng nếp `EmailOutboxJob` (booking B15): mỗi phút gọi `AppointmentReminderService.sweep(now)` rồi ghi log tổng kết.
 *  - MỘT mốc `now` (đã cắt xuống giây) cho cả lượt; test đưa mốc giả vào `run(now)`.
 *  - Chống chạy chồng trong cùng tiến trình bằng cờ `running`; hai bản API cùng chạy vẫn đúng nhờ khoá chính và câu nhận việc có điều kiện.
 *  - `run` KHÔNG BAO GIỜ ném (framework log nguyên đối tượng lỗi, kể cả `message`): lỗi được nuốt, log ERROR chỉ có loại lỗi cố định.
 * Log CHỈ có số lượng, id nội bộ và loại lỗi: không email, họ tên hay nội dung thư (BTB-01). Tắt ở NODE_ENV=test; test gọi `run(now)` trực tiếp.
 */
@Injectable()
export class AppointmentReminderJob {
  private readonly logger = new Logger(AppointmentReminderJob.name);
  private running = false;

  constructor(
    @Inject(AppointmentReminderService)
    private readonly reminders: AppointmentReminderService,
  ) {}

  /** Trả tóm tắt lượt vừa chạy; `undefined` nếu bị bỏ qua vì lượt trước còn chạy. Bộ lập lịch gọi KÈM đối số của thư viện `cron`: chỉ nhận `now` khi nó đúng là `Date`. */
  @Cron(REMINDER_CRON, {
    name: REMINDER_JOB_NAME,
    disabled: process.env.NODE_ENV === 'test',
  })
  async run(now?: Date): Promise<ReminderSummary | undefined> {
    if (this.running) {
      this.logger.warn('Lượt nhắc lịch trước vẫn đang chạy: bỏ qua lượt này');
      return undefined;
    }
    this.running = true;
    const summary = emptyReminderSummary();
    try {
      await this.reminders.sweep(
        toSecond(now instanceof Date ? now : nowVN()),
        summary,
      );
    } catch (error) {
      this.logger.error(
        `Nhắc lịch: lượt bị dừng vì lỗi hệ thống (${reminderFailureText(error)})`,
      );
    } finally {
      this.running = false;
    }
    this.report(summary);
    return summary;
  }

  private report(summary: ReminderSummary): void {
    const { created, sent, failed, lostClaim, dropped, more } = summary;
    if (created + sent + failed + lostClaim + dropped === 0) return;
    this.logger.log(
      `Nhắc lịch: tạo ${String(created)}, gửi ${String(sent)}, lỗi ${String(failed)}, bên khác nhận trước ${String(lostClaim)}, bỏ vì lịch đổi ${String(dropped)}${more ? '; còn mốc chờ lượt sau' : ''}`,
    );
  }
}
