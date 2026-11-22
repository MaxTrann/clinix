import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { nowVN, toSecond } from '../../../common/time/time.js';
import {
  BranchChangeApplyRepository,
  type DueCursor,
} from './branch-change-apply.repository.js';
import {
  BranchChangeApplyService,
  type ApplyOutcome,
} from './branch-change-apply.service.js';

// Hằng số lịch chạy (Trung chốt 22/11/2026: hằng số trong mã như booking, không thêm biến .env)
export const BRANCH_CHANGE_APPLY_CRON = '30 * * * * *'; // mỗi phút, giây 30 (lệch giây 20 của job giữ chỗ)
export const BRANCH_CHANGE_APPLY_JOB_NAME = 'branch-change-apply';
export const APPLY_BATCH_SIZE = 100;
export const APPLY_MAX_BATCHES = 10;

export interface ApplySummary {
  applied: number;
  overdue: number;
  /** Không còn là ứng viên khi khoá (bên khác đã xử lý) */
  notDue: number;
  /** Nội dung hỏng (CN-86) */
  invalid: number;
  /** Giao dịch lỗi và đã hoàn tác; lượt sau thử lại */
  failed: number;
  /** Còn ứng viên chưa tới lượt vì hết trần số lô */
  more: boolean;
}

/**
 * Job áp dụng thay đổi chi nhánh khi tới `hieu_luc_tu` (admin B11; PLAN admin 5.4; CN b10). Theo nếp `HoldExpiryJob` của booking:
 *  - MỘT mốc `now` (cắt giây) cho cả lượt; test gọi `run(now)` trực tiếp.
 *  - Câu chọn chỉ là DANH SÁCH ứng viên; `applyOne` kiểm lại dưới khoá hàng, nên hai bản API cùng chạy vẫn áp dụng đúng một lần (CN-82).
 *  - MỖI yêu cầu một giao dịch; một yêu cầu lỗi không dừng lượt (con trỏ `(hieu_luc_tu, id)` đi qua nó), lượt sau thử lại (CN-84).
 *  - Cờ `running` chống chạy chồng trong cùng tiến trình. `run` không bao giờ ném.
 *  - Log chỉ có số lượng, id yêu cầu, mã lỗi nội dung và tên lớp lỗi (không có `error.message`, không có dữ liệu người dùng).
 * KHÔNG gọi `ScheduleModule.forRoot()` (đã đăng ký một lần ở `app.module.ts`; gọi thêm thì mọi job chạy gấp đôi, TECH_DEBT dòng 33). Tắt ở NODE_ENV=test.
 */
@Injectable()
export class BranchChangeApplyJob {
  private readonly logger = new Logger(BranchChangeApplyJob.name);
  private running = false;

  constructor(
    @Inject(BranchChangeApplyRepository)
    private readonly requests: BranchChangeApplyRepository,
    @Inject(BranchChangeApplyService)
    private readonly apply: BranchChangeApplyService,
  ) {}

  /** `undefined` nếu bị bỏ qua vì lượt trước còn chạy. Chỉ nhận `now` khi đúng là `Date` (bộ lập lịch truyền đối số của thư viện `cron`). */
  @Cron(BRANCH_CHANGE_APPLY_CRON, {
    name: BRANCH_CHANGE_APPLY_JOB_NAME,
    disabled: process.env.NODE_ENV === 'test',
  })
  async run(now?: Date): Promise<ApplySummary | undefined> {
    if (this.running) {
      this.logger.warn(
        'Lượt áp dụng thay đổi chi nhánh trước vẫn đang chạy: bỏ qua lượt này',
      );
      return undefined;
    }
    this.running = true;
    const summary: ApplySummary = {
      applied: 0,
      overdue: 0,
      notDue: 0,
      invalid: 0,
      failed: 0,
      more: false,
    };
    try {
      await this.sweep(toSecond(now instanceof Date ? now : nowVN()), summary);
    } catch (error) {
      this.logger.error(
        `Áp dụng thay đổi chi nhánh: không đọc được danh sách ứng viên (${nameOf(error)})`,
      );
    } finally {
      this.running = false;
    }
    if (
      summary.applied + summary.overdue + summary.invalid + summary.failed >
      0
    )
      this.logger.log(
        `Áp dụng thay đổi chi nhánh: áp dụng ${String(summary.applied)}, quá hạn ${String(summary.overdue)}, nội dung hỏng ${String(summary.invalid)}, lỗi ${String(summary.failed)}${summary.more ? '; còn ứng viên chờ lượt sau' : ''}`,
      );
    return summary;
  }

  private async sweep(now: Date, summary: ApplySummary): Promise<void> {
    let after: DueCursor | null = null;
    for (let batch = 0; batch < APPLY_MAX_BATCHES; batch++) {
      const rows = await this.requests.findDue({
        now,
        after,
        limit: APPLY_BATCH_SIZE,
      });
      for (const row of rows) {
        await this.applyOne(row.id, now, summary);
        after = row;
      }
      if (rows.length < APPLY_BATCH_SIZE) return;
    }
    summary.more = true;
  }

  private async applyOne(
    id: string,
    now: Date,
    summary: ApplySummary,
  ): Promise<void> {
    let outcome: ApplyOutcome;
    try {
      outcome = await this.apply.applyOne(id, now);
    } catch (error) {
      summary.failed += 1;
      this.logger.error(
        `Không áp dụng được yêu cầu thay đổi chi nhánh ${id} (${nameOf(error)}); đã hoàn tác, lượt sau thử lại`,
      );
      return;
    }
    if (outcome.kind === 'DaApDung') summary.applied += 1;
    else if (outcome.kind === 'QuaHan') summary.overdue += 1;
    else if (outcome.kind === 'KhongDenHan') summary.notDue += 1;
    else {
      summary.invalid += 1;
      // Lặp lại mỗi lượt cho tới khi có người sửa (dời hay hủy yêu cầu): cố ý ERROR để người vận hành thấy
      this.logger.error(
        `Yêu cầu thay đổi chi nhánh ${id} có nội dung không áp dụng được: ${outcome.maLoi.join(', ')}`,
      );
    }
  }
}

function nameOf(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
