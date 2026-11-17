import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { nowVN, toSecond } from '../../common/time/time.js';
import {
  REFUND_MAX_ATTEMPTS,
  REFUND_RETRY_BATCH_SIZE,
  REFUND_RETRY_CRON,
  REFUND_RETRY_GAP_MINUTES,
  REFUND_RETRY_JOB_NAME,
  REFUND_RETRY_MAX_BATCHES,
} from '../wallet.constants.js';
import { RefundRepository } from './refund.queries.js';
import { RefundService } from './refund.service.js';

export interface RefundRetrySummary {
  /** Thử lại thành công (`Refunded`) */
  refunded: number;
  /** `Failed`: lần thử này lại thất bại (dòng `ThatBai` mới đã ghi, hay đã hết lượt) */
  failed: number;
  /** `NotNeeded`: khoản đã hoàn hết tới trần (ví dụ Quản trị viên hoàn đặc biệt giữa lúc chờ) */
  notNeeded: number;
  /** Có thể còn ứng viên chưa tới lượt vì đã hết trần số lô của lượt này */
  more: boolean;
}

/**
 * Job thử lại hoàn cọc đã thất bại (payment B8; PLAN 5.6.1 (4); HCC-05, HCC-06; M14). Lớp chạy theo lịch (`*.job.ts`), theo nếp `HoldExpiryJob` của booking.
 *
 * Mỗi lượt: chọn khoản có dòng tự động MỚI NHẤT là `ThatBai`, chưa đủ `REFUND_MAX_ATTEMPTS` lần, dòng đó đã quá `REFUND_RETRY_GAP_MINUTES` (5 phút; đúng bằng mốc thì ĐƯỢC thử), quét theo lô với con trỏ
 * `giao_dich_thanh_toan_id`; rồi chạy lại ĐÚNG thuật toán (`RefundService.retry`) với số và lý do ĐÃ GHI, MỖI khoản trong giao dịch riêng. Sau lần thất bại cuối, `RefundService` tự báo Quản trị viên.
 *  - MỘT mốc `now` (cắt xuống giây) cho cả lượt; test đưa mốc giả vào `run(now)`.
 *  - Hai bản API cùng chạy job KHÔNG thử trùng (M14): bên sau bị chặn ở khoá X khoản thanh toán rồi thấy dòng mới (đã hoàn, hay đã đủ lần) và không ghi thêm; UNIQUE `(khoản, so_lan_thu)` là lưới thứ hai.
 *  - Một khoản lỗi KHÔNG dừng lượt: con trỏ bảo đảm khoản lỗi mãi không chặn khoản sau; `run` không bao giờ ném.
 *  - Chống chạy chồng trong cùng tiến trình bằng cờ `running`.
 * Log CHỈ có số lượng và tên lớp lỗi: không số tiền, không id ví. `ScheduleModule.forRoot()` chỉ ở `app.module.ts`. Tắt ở NODE_ENV=test để job không tự chạy giữa các test dựng AppModule.
 */
@Injectable()
export class RefundRetryJob {
  private readonly logger = new Logger(RefundRetryJob.name);
  private running = false;

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(RefundRepository) private readonly repository: RefundRepository,
    @Inject(RefundService) private readonly refunds: RefundService,
  ) {}

  /** Bộ lập lịch gọi hàm này KÈM ĐỐI SỐ của thư viện `cron` (`onComplete`): chỉ nhận `now` khi nó đúng là `Date`. */
  @Cron(REFUND_RETRY_CRON, {
    name: REFUND_RETRY_JOB_NAME,
    disabled: process.env.NODE_ENV === 'test',
  })
  async run(now?: Date): Promise<RefundRetrySummary | undefined> {
    if (this.running) {
      this.logger.warn('Lượt thử lại hoàn cọc trước vẫn đang chạy: bỏ qua');
      return undefined;
    }
    this.running = true;
    const summary: RefundRetrySummary = {
      refunded: 0,
      failed: 0,
      notNeeded: 0,
      more: false,
    };
    try {
      const at = toSecond(now instanceof Date ? now : nowVN());
      const before = new Date(at.getTime() - REFUND_RETRY_GAP_MINUTES * 60_000);
      let cursor = '0';
      for (let batch = 0; batch < REFUND_RETRY_MAX_BATCHES; batch += 1) {
        const candidates = await this.repository.findRetryCandidates(
          this.db.manager,
          {
            before,
            maxAttempts: REFUND_MAX_ATTEMPTS,
            afterPaymentId: cursor,
            limit: REFUND_RETRY_BATCH_SIZE,
          },
        );
        for (const candidate of candidates) {
          cursor = candidate.giaoDichThanhToanId;
          await this.retryOne(candidate, summary);
        }
        if (candidates.length < REFUND_RETRY_BATCH_SIZE) return summary;
        summary.more = batch === REFUND_RETRY_MAX_BATCHES - 1;
      }
      return summary;
    } catch (error) {
      this.logger.error(
        `Lượt thử lại hoàn cọc dừng giữa chừng: ${error instanceof Error ? error.name : typeof error}`,
      );
      return summary;
    } finally {
      this.running = false;
      this.logger.log(
        `Thử lại hoàn cọc: thành công ${summary.refunded}, thất bại ${summary.failed}, không cần ${summary.notNeeded}`,
      );
    }
  }

  private async retryOne(
    candidate: Parameters<RefundService['retry']>[0],
    summary: RefundRetrySummary,
  ): Promise<void> {
    try {
      const result = await this.refunds.retry(candidate);
      if (result.kind === 'Refunded') summary.refunded += 1;
      else if (result.kind === 'Failed') summary.failed += 1;
      else summary.notNeeded += 1;
    } catch (error) {
      summary.failed += 1;
      this.logger.error(
        `Thử lại hoàn cọc của khoản ${candidate.giaoDichThanhToanId} ném lỗi: ${error instanceof Error ? error.name : typeof error}`,
      );
    }
  }
}
