import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { nowVN, toSecond } from '../../common/time/time.js';
import {
  emptyEmailOutboxSummary,
  EmailOutboxService,
  failureTextOf,
  type EmailOutboxSummary,
} from './email-outbox.service.js';
import {
  EMAIL_OUTBOX_CRON,
  EMAIL_OUTBOX_JOB_NAME,
} from './notifications.constants.js';

/**
 * Job gửi thư của hộp thư đi (task B15; PLAN booking 5.12; TRACKING 3.37 B15-H). Lớp chạy theo lịch (`*.job.ts`) MỎNG, đúng nếp `HoldExpiryJob` (B9) và `NoShowJob` (B13): mỗi phút gọi `EmailOutboxService.sweep(now)` rồi ghi log tổng kết.
 *  - MỘT mốc `now` (đã cắt xuống giây) cho cả lượt; test đưa mốc giả vào `run(now)`.
 *  - Chống chạy chồng trong cùng tiến trình bằng cờ `running`; hai bản API cùng chạy vẫn đúng nhờ câu nhận việc có điều kiện, không cần khoá riêng.
 *  - `run` KHÔNG BAO GIỜ ném (framework log nguyên đối tượng lỗi, kể cả `message`): lỗi DB hay lỗi ghi kết quả được nuốt và ghi ERROR chỉ có loại lỗi cố định.
 *
 * Log CHỈ có số lượng và loại lỗi: không địa chỉ, tiêu đề hay nội dung thư (H12). Tắt ở NODE_ENV=test để job không tự chạy giữa các test dựng AppModule (không bao giờ có thư thật trong test, TB-08); test gọi `run(now)` trực tiếp.
 * Lịch: `ScheduleModule.forRoot()` chỉ được gọi MỘT lần, ở `app.module.ts`; ở đây chỉ `@Cron`.
 */
@Injectable()
export class EmailOutboxJob {
  private readonly logger = new Logger(EmailOutboxJob.name);
  private running = false;

  constructor(
    @Inject(EmailOutboxService) private readonly outbox: EmailOutboxService,
  ) {}

  /**
   * Trả tóm tắt lượt vừa chạy; `undefined` nếu lượt này bị bỏ qua vì lượt trước (cùng tiến trình) còn chạy. Bộ lập lịch gọi hàm này KÈM ĐỐI SỐ của thư viện `cron` (hiện là `undefined`): chỉ nhận `now` khi nó đúng là `Date`.
   */
  @Cron(EMAIL_OUTBOX_CRON, {
    name: EMAIL_OUTBOX_JOB_NAME,
    disabled: process.env.NODE_ENV === 'test',
  })
  async run(now?: Date): Promise<EmailOutboxSummary | undefined> {
    if (this.running) {
      this.logger.warn('Lượt gửi thư trước vẫn đang chạy: bỏ qua lượt này');
      return undefined;
    }
    this.running = true;
    const summary = emptyEmailOutboxSummary();
    let completed = false;
    try {
      await this.outbox.sweep(
        toSecond(now instanceof Date ? now : nowVN()),
        summary,
      );
      completed = true;
    } catch (error) {
      this.logger.error(
        `Gửi thư: lượt bị dừng vì lỗi hệ thống (${failureTextOf(error)})`,
      );
    } finally {
      this.running = false;
    }
    this.report(summary, completed);
    return summary;
  }

  private report(summary: EmailOutboxSummary, completed: boolean): void {
    const { sent, failed, lostClaim, more } = summary;
    if (sent + failed + lostClaim === 0) {
      if (completed && !summary.notConfigured)
        this.logger.debug('Gửi thư: không có thư nào đến lượt');
      return;
    }
    this.logger.log(
      `Gửi thư: đã gửi ${String(sent)}, lỗi ${String(failed)}, bên khác nhận trước ${String(lostClaim)}${more ? '; còn thư chờ lượt sau' : ''}`,
    );
  }
}
