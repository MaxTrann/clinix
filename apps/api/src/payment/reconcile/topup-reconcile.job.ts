import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { nowVN, toSecond } from '../../common/time/time.js';
import { TOPUP_RECONCILE_MAX_RETRIES } from '../../wallet/wallet.constants.js';
import {
  TOPUP_RECONCILE_BATCH_SIZE,
  TOPUP_RECONCILE_CRON,
  TOPUP_RECONCILE_GAP_MINUTES,
  TOPUP_RECONCILE_JOB_NAME,
  TOPUP_RECONCILE_MAX_BATCHES,
} from '../payment.constants.js';
import { ReconcileRepository } from './reconcile.repository.js';
import {
  ReconcileService,
  type ReconcileOutcome,
} from './reconcile.service.js';

export interface ReconcileSummary {
  credited: number;
  alreadyCredited: number;
  failed: number;
  skipped: number;
  /** Có thể còn ứng viên vì đã hết trần số lô của lượt này */
  more: boolean;
}

const COUNTER: Record<ReconcileOutcome, keyof Omit<ReconcileSummary, 'more'>> =
  {
    Credited: 'credited',
    AlreadyCredited: 'alreadyCredited',
    Failed: 'failed',
    Skipped: 'skipped',
  };

/**
 * Job đối soát nạp ví (payment B14; PLAN 5.4 bước 5; DST-01, DST-04, DST-06, DST-07; M14). Theo nếp `RefundRetryJob` (B8):
 *  - MỘT mốc `now` (cắt xuống giây) cho cả lượt; test đưa mốc giả vào `run(now)`.
 *  - Quét theo lô với con trỏ id: giao dịch lỗi mãi không chặn giao dịch sau, và không bị thử hai lần trong một lượt (DST-07).
 *  - Mỗi giao dịch một giao dịch CSDL riêng (`ReconcileService`); hai bản API chạy cùng lúc thì bên sau bị chặn ở khoá 7a rồi thấy đã xử lý (DST-06).
 *  - `run` không bao giờ ném; chống chạy chồng trong cùng tiến trình bằng cờ `running`. Tắt ở NODE_ENV=test để job không tự chạy giữa các test dựng AppModule.
 * Log chỉ có số lượng và mã lỗi: không số tiền, không id ví.
 */
@Injectable()
export class TopupReconcileJob {
  private readonly logger = new Logger(TopupReconcileJob.name);
  private running = false;

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(ReconcileRepository)
    private readonly repository: ReconcileRepository,
    @Inject(ReconcileService) private readonly reconciler: ReconcileService,
  ) {}

  /** Bộ lập lịch gọi hàm này KÈM ĐỐI SỐ của thư viện `cron`: chỉ nhận `now` khi nó đúng là `Date`. */
  @Cron(TOPUP_RECONCILE_CRON, {
    name: TOPUP_RECONCILE_JOB_NAME,
    disabled: process.env.NODE_ENV === 'test',
  })
  async run(now?: Date): Promise<ReconcileSummary | undefined> {
    if (this.running) {
      this.logger.warn('Lượt đối soát nạp ví trước vẫn đang chạy: bỏ qua');
      return undefined;
    }
    this.running = true;
    const summary: ReconcileSummary = {
      credited: 0,
      alreadyCredited: 0,
      failed: 0,
      skipped: 0,
      more: false,
    };
    try {
      const at = toSecond(now instanceof Date ? now : nowVN());
      const before = new Date(
        at.getTime() - TOPUP_RECONCILE_GAP_MINUTES * 60_000,
      );
      let cursor = '0';
      for (let batch = 0; batch < TOPUP_RECONCILE_MAX_BATCHES; batch += 1) {
        const ids = await this.repository.findCandidates(this.db.manager, {
          before,
          maxRetries: TOPUP_RECONCILE_MAX_RETRIES,
          afterId: cursor,
          limit: TOPUP_RECONCILE_BATCH_SIZE,
        });
        for (const id of ids) {
          cursor = id;
          summary[COUNTER[await this.reconciler.reconcile(id, at)]] += 1;
        }
        if (ids.length < TOPUP_RECONCILE_BATCH_SIZE) return summary;
        summary.more = batch === TOPUP_RECONCILE_MAX_BATCHES - 1;
      }
      return summary;
    } catch (error) {
      this.logger.error(
        `Lượt đối soát nạp ví dừng giữa chừng: ${error instanceof Error ? error.name : typeof error}`,
      );
      return summary;
    } finally {
      this.running = false;
      this.logger.log(
        `Đối soát nạp ví: cộng ${summary.credited}, đã có ${summary.alreadyCredited}, lỗi ${summary.failed}, bỏ qua ${summary.skipped}`,
      );
    }
  }
}
