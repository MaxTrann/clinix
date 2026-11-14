import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { toSecond } from '../../common/time/time.js';
import {
  BOOKING_JOB_BATCH_SIZE,
  BOOKING_JOB_MAX_BATCHES,
} from '../appointments.constants.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import {
  AppointmentTransitionService,
  failureOf,
  type ExpireOutcome,
  type MarkNoShowOutcome,
} from '../state/appointment-transition.service.js';
import type { StatusConfig } from '../state/status-config.js';
import {
  countUnattended,
  findNoShowCandidates,
  isNoShowDue,
} from './no-show-due.query.js';

/** Kết quả MỘT lịch của một lượt (TRACKING 3.29 B13-C). */
export type NoShowItemOutcome =
  /** Lịch `VangMat`, `so_lan_no_show` đã cộng 1, thông báo đã ghi (do `markNoShow`); đã commit */
  | Extract<MarkNoShowOutcome, { kind: 'NoShowed' }>
  /** Không còn `DaXacNhan` dưới khoá (Lễ tân vừa tiếp đón hay huỷ, bên kia đã đánh) hoặc không còn lịch */
  | { kind: 'NotConfirmed' }
  /** Còn `DaXacNhan` nhưng không còn đến hạn khi kiểm lại dưới khoá: ca chưa kết thúc, giờ hẹn chưa tới, hoặc (B18) lịch đã được Quản trị viên override (cùng một mệnh đề `DUE_WHERE_SQL`) */
  | Extract<MarkNoShowOutcome, { kind: 'NotDue' }>
  /** Giao dịch của lịch đã hoàn tác trọn; lịch vẫn `DaXacNhan` nên lượt sau chọn lại. `Busy`: hết lượt thử lại 1213/1205; `Error`: lỗi khác */
  | Extract<ExpireOutcome, { kind: 'Failed' }>;

export interface NoShowSummary {
  /** `markNoShow` trả `NoShowed` */
  noShowed: number;
  /** Lịch đã đổi trạng thái giữa lúc quét và lúc khoá */
  notConfirmed: number;
  /** Lịch còn `DaXacNhan` nhưng không còn đến hạn khi kiểm lại dưới khoá (ca chưa kết thúc, hoặc đã được Quản trị viên override: B18) */
  notDue: number;
  /** Hết lượt thử lại do tranh chấp khoá (tạm thời) */
  failedBusy: number;
  /** Lỗi khác, kể cả dữ liệu lệch (cần người xem) */
  failedError: number;
  /** Lịch `DaXacNhan` đã quá giờ hẹn mà ca không có giờ kết thúc: không tự đánh được (một con số cho cả lượt) */
  unattended: number;
  /** Chưa có `cau_hinh_he_thong`: lượt bị bỏ, không đoán ngưỡng (quy tắc 35) */
  configMissing: boolean;
  /** Có thể còn ứng viên chưa tới lượt vì đã hết trần số lô của lượt này */
  more: boolean;
}

export const emptyNoShowSummary = (): NoShowSummary => ({
  noShowed: 0,
  notConfirmed: 0,
  notDue: 0,
  failedBusy: 0,
  failedError: 0,
  unattended: 0,
  configMissing: false,
  more: false,
});

const NO_SHOW_TX_LABEL = 'no-show-job';

// `markNoShow` trả kết quả của MỘT giao dịch; đổi sang kết quả của job. `NotFound` (lịch biến mất giữa hai lần đọc) cũng là "không còn". `ConfigMissing` KHÔNG đến được (cấu hình đã kiểm từ đầu lượt và không
// bao giờ truyền `null`) nhưng không được nuốt im lặng: thành lỗi thấy được.
function fromMarkNoShow(outcome: MarkNoShowOutcome): NoShowItemOutcome {
  switch (outcome.kind) {
    case 'NoShowed':
    case 'NotDue':
      return outcome;
    case 'NotFound':
    case 'InvalidState':
      return { kind: 'NotConfirmed' };
    case 'ConfigMissing':
      return { kind: 'Failed', reason: 'Error', errorName: 'ConfigMissing' };
  }
}

/**
 * MỘT LƯỢT của job tự Vắng mặt (task B13; PLAN booking 5.7, Q23; TRACKING 3.29 B13-C, B13-E): quét lịch `DaXacNhan` mà ca đã kết thúc theo lô rồi đánh Vắng mặt MỖI lịch trong MỘT giao dịch riêng
 * (`withBookingTransaction`) bằng `AppointmentTransitionService.markNoShow` với `actor: 'HeThong'`. Tách khỏi lớp `@Cron` (`NoShowJob`) để test gọi `sweep(now)` thẳng, không dính cờ chạy chồng và lịch.
 *
 * Việc ở đây CHỈ là chọn ứng viên và vòng lặp: đổi trạng thái, cộng `so_lan_no_show`, bật cờ khoá và thông báo là của `markNoShow` (B12). Không `UPDATE` nào, KHÔNG giải phóng khung giờ (INV-3: `VangMat` giữ
 * `DaDat`), không `WaitlistPort`, không gửi thông báo riêng (VM-08).
 *  - `now` do người gọi truyền (đã `toSecond(nowVN())`) và `config` đọc MỘT lần NGOÀI giao dịch: thân giao dịch chạy lại được khi 1213, 1205 mà không đọc lại đồng hồ hay cấu hình. `config === null` ⇒ bỏ lượt
 *    ngay (không câu chọn nào, không đoán ngưỡng, VM-12).
 *  - Câu chọn ứng viên chỉ là DANH SÁCH; quyết định thật nằm ở `markNoShow` dưới khoá (`isNoShowDue` kiểm lại cùng mệnh đề): lịch vừa tiếp đón hay vừa huỷ chỉ bị bỏ qua, không bao giờ đánh nhầm.
 *  - Một lịch lỗi (1213 hết lượt thử lại, dữ liệu lệch…) KHÔNG dừng lượt: giao dịch của nó đã hoàn tác trọn, nó vẫn là ứng viên nên lượt sau thử lại; con trỏ `lich_hen_id` đi qua nó nên nó không chặn các lịch sau.
 *  - Hai bản API cùng chạy là an toàn: cùng thứ tự khoá `benh_nhan` rồi `lich_hen`, bản sau thấy lịch đã `VangMat` và ra `NotConfirmed` (VM-09).
 * Log từng lịch lỗi chỉ có mã lịch, lý do và tên lớp lỗi (không `error.message`).
 *
 * `sweep` chỉ ném khi đọc dữ liệu hỏng (cấu hình, danh sách ứng viên, câu đếm); `summary` truyền vào được cộng dồn nên phần đã làm không mất khi ném. Người gọi (`NoShowJob.run`) bắt lỗi đó.
 */
@Injectable()
export class NoShowSweepService {
  private readonly logger = new Logger(NoShowSweepService.name);

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(AppointmentTransitionService)
    private readonly transitions: AppointmentTransitionService,
    @Inject(SystemConfigService)
    private readonly configs: SystemConfigService,
  ) {}

  async sweep(
    now: Date,
    summary: NoShowSummary = emptyNoShowSummary(),
  ): Promise<NoShowSummary> {
    const at = toSecond(now);
    const config = await this.configs.get();
    if (config === null) {
      summary.configMissing = true;
      return summary;
    }

    let after: string | null = null;
    let drained = false;
    for (let batch = 0; batch < BOOKING_JOB_MAX_BATCHES; batch++) {
      const ids = await findNoShowCandidates(this.db.manager, {
        now: at,
        afterId: after,
        limit: BOOKING_JOB_BATCH_SIZE,
      });
      for (const lichHenId of ids) {
        this.record(
          summary,
          lichHenId,
          await this.markOne(lichHenId, at, config),
        );
        // Con trỏ = lịch vừa xử lý (kể cả lịch lỗi): sau một lô đầy nó chính là lịch cuối của lô
        after = lichHenId;
      }
      if (ids.length < BOOKING_JOB_BATCH_SIZE) {
        drained = true;
        break;
      }
    }
    summary.more = !drained;
    summary.unattended = await countUnattended(this.db.manager, at);
    return summary;
  }

  // MỘT giao dịch cho MỘT lịch. Không ném: mọi lỗi thành `Failed` (`failureOf`), để một lịch hỏng không dừng lượt.
  private async markOne(
    lichHenId: string,
    now: Date,
    config: StatusConfig,
  ): Promise<NoShowItemOutcome> {
    try {
      const outcome = await withBookingTransaction(
        this.db,
        (em) =>
          this.transitions.markNoShow(em, {
            actor: 'HeThong',
            lichHenId,
            now,
            config,
            isDue: (inner) => isNoShowDue(inner, lichHenId, now),
          }),
        { label: NO_SHOW_TX_LABEL },
      );
      return fromMarkNoShow(outcome);
    } catch (error) {
      return failureOf(error);
    }
  }

  private record(
    summary: NoShowSummary,
    lichHenId: string,
    outcome: NoShowItemOutcome,
  ): void {
    switch (outcome.kind) {
      case 'NoShowed':
        summary.noShowed += 1;
        return;
      case 'NotConfirmed':
        summary.notConfirmed += 1;
        return;
      case 'NotDue':
        summary.notDue += 1;
        return;
      case 'Failed': {
        const message = `Không đánh Vắng mặt được lịch ${lichHenId}: ${outcome.reason} (${outcome.errorName})`;
        // `Busy` (tranh chấp khoá, đã thử lại hết lượt) là tạm thời nên chỉ cảnh báo; còn lại là ERROR cần người xem
        if (outcome.reason === 'Busy') {
          summary.failedBusy += 1;
          this.logger.warn(
            `${message}; giao dịch đã hoàn tác, lượt sau thử lại`,
          );
        } else {
          summary.failedError += 1;
          this.logger.error(message);
        }
        return;
      }
    }
  }
}
