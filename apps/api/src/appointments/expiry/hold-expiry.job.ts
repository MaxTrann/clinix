import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { nowVN, toSecond } from '../../common/time/time.js';
import {
  BOOKING_JOB_BATCH_SIZE,
  BOOKING_JOB_MAX_BATCHES,
  HOLD_EXPIRY_CRON,
  HOLD_EXPIRY_JOB_NAME,
} from '../appointments.constants.js';
import {
  AppointmentTransitionService,
  errorNameOf,
  type ExpireOutcome,
} from '../state/appointment-transition.service.js';
import {
  findLapsedHoldCandidates,
  type LapsedHoldCursor,
} from './lapsed-hold-candidates.query.js';

export interface HoldExpirySummary {
  /** `expire` trả `Expired`: lịch `DaHuy` và khung giờ `ConTrong` */
  expired: number;
  /** `expire` trả `NotDue`: lịch đã đổi giữa lúc quét và lúc khoá (vừa thanh toán, vừa huỷ, bên kia đã hết hạn) */
  notDue: number;
  /** `expire` trả `Failed` (hoặc ném): giao dịch của lịch đó đã hoàn tác trọn; lượt sau thử lại */
  failed: number;
  /** Có thể còn ứng viên chưa tới lượt vì đã hết trần số lô của lượt này */
  more: boolean;
}

/**
 * Job tự huỷ lịch `ChoThanhToan` đã quá `han_thanh_toan` (task B9; PLAN booking 5.5, ĐLK b19, A5, Q6). Lớp chạy theo lịch (`*.job.ts`), theo nếp `UnverifiedPatientCleanupJob` của A7.
 *
 * Mỗi lượt: quét theo lô (`BOOKING_JOB_BATCH_SIZE`, tối đa `BOOKING_JOB_MAX_BATCHES` lô, con trỏ `(han_thanh_toan, lich_hen_id)`) rồi hết hạn MỖI lịch trong MỘT giao dịch riêng bằng
 * `AppointmentTransitionService.expire` (khoá khung giờ rồi lịch, kiểm lại dưới khoá, thả khung giờ, sau commit báo `WaitlistPort`). Không có `UPDATE` nào ở đây: job chỉ ĐỌC danh sách ứng viên.
 *  - MỘT mốc `now` (đã cắt xuống giây) cho cả lượt: câu chọn ứng viên và mọi `expire` dùng cùng mốc, nên kết quả xác định (test đưa mốc giả vào `run(now)`). Kiểm lại dưới khoá với mốc ĐẦU lượt
 *    chỉ có thể thận trọng hơn (giờ thật luôn muộn hơn mốc), không bao giờ hết hạn sớm.
 *  - Câu chọn chỉ là DANH SÁCH ứng viên; lịch vừa thanh toán hay vừa huỷ chỉ bị bỏ qua (`notDue`), không bao giờ huỷ nhầm.
 *  - Một lịch lỗi (1213, 1205 hết lượt thử lại, dữ liệu lệch…) KHÔNG dừng lượt và không làm sập tiến trình: giao dịch của nó đã hoàn tác trọn, nó vẫn là ứng viên nên lượt sau thử lại. Con trỏ bảo đảm
 *    lịch lỗi vĩnh viễn không chặn các lịch sau nó. `expire` không ném, nhưng job vẫn bắt lỗi từng lịch để một vi phạm hợp đồng cũng không dừng lượt.
 *  - Hai bản API cùng chạy job là an toàn, không cần khoá riêng (DT-16): bên sau bị chặn ở khoá khung giờ rồi thấy lịch đã `DaHuy` (`notDue`); cả hai đi theo thứ tự khoá chung nên không có chu trình chờ.
 *  - Chống chạy chồng trong cùng tiến trình bằng cờ `running` (lượt trước chưa xong thì bỏ qua lượt này).
 *
 * Log CHỈ có số lượng, mã lịch (`lich_hen_id`), loại lỗi và tên lớp lỗi: không bao giờ có email, họ tên hay `error.message`. `run` không bao giờ ném (framework log nguyên đối tượng lỗi nếu ném).
 *
 * Lịch: `ScheduleModule.forRoot()` chỉ được gọi MỘT lần, ở `app.module.ts` (đã kiểm bằng grep); `@Cron` của mọi module được bộ lập lịch toàn ứng dụng tìm thấy. KHÔNG gọi `ScheduleModule.forRoot()` lần nữa ở đây
 * (mỗi lần gọi là một module riêng nên mọi job chạy gấp đôi mỗi nhịp, TECH_DEBT dòng 33) và `AppointmentsModule` không import `ScheduleModule` (AR-03 quét `forRoot(` trong cả `appointments/`).
 * Tắt ở NODE_ENV=test để job không tự chạy giữa các test dựng AppModule; test gọi `run(now)` trực tiếp (HG-09).
 */
@Injectable()
export class HoldExpiryJob {
  private readonly logger = new Logger(HoldExpiryJob.name);
  private running = false;

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(AppointmentTransitionService)
    private readonly transitions: AppointmentTransitionService,
  ) {}

  /**
   * Trả tóm tắt lượt vừa chạy; `undefined` nếu lượt này bị bỏ qua vì lượt trước (cùng tiến trình) còn chạy.
   * Bộ lập lịch gọi hàm này KÈM ĐỐI SỐ của thư viện `cron` (`onComplete`, hiện là `undefined`): chỉ nhận `now` khi nó đúng là `Date`, còn lại lấy đồng hồ, để một đối số lạ không biến thành mốc rác.
   */
  @Cron(HOLD_EXPIRY_CRON, {
    name: HOLD_EXPIRY_JOB_NAME,
    disabled: process.env.NODE_ENV === 'test',
  })
  async run(now?: Date): Promise<HoldExpirySummary | undefined> {
    if (this.running) {
      this.logger.warn(
        'Lượt hết hạn giữ chỗ trước vẫn đang chạy: bỏ qua lượt này',
      );
      return undefined;
    }
    this.running = true;
    const summary: HoldExpirySummary = {
      expired: 0,
      notDue: 0,
      failed: 0,
      more: false,
    };
    let completed = false;
    try {
      await this.sweep(toSecond(now instanceof Date ? now : nowVN()), summary);
      completed = true;
    } catch (error) {
      // Lỗi đọc danh sách ứng viên (DB sập…): nuốt ở đây, KHÔNG ném lên framework (nó log nguyên lỗi, kể cả message)
      this.logger.error(
        `Hết hạn giữ chỗ: không đọc được danh sách ứng viên (${errorNameOf(error)})`,
      );
    } finally {
      this.running = false;
    }
    this.report(summary, completed);
    return summary;
  }

  private async sweep(now: Date, summary: HoldExpirySummary): Promise<void> {
    let after: LapsedHoldCursor | null = null;
    for (let batch = 0; batch < BOOKING_JOB_MAX_BATCHES; batch++) {
      const rows = await findLapsedHoldCandidates(this.db.manager, {
        now,
        after,
        limit: BOOKING_JOB_BATCH_SIZE,
      });
      for (const row of rows) {
        await this.expireOne(row.lichHenId, now, summary);
        // Con trỏ = hàng vừa xử lý: sau một lô đầy nó chính là hàng cuối của lô
        after = { han: row.han, lichHenId: row.lichHenId };
      }
      if (rows.length < BOOKING_JOB_BATCH_SIZE) return;
    }
    summary.more = true;
  }

  private async expireOne(
    lichHenId: string,
    now: Date,
    summary: HoldExpirySummary,
  ): Promise<void> {
    let outcome: ExpireOutcome;
    try {
      outcome = await this.transitions.expire({ lichHenId, now });
    } catch (error) {
      // `expire` hứa không ném; nếu một ngày nào đó vi phạm thì chỉ lịch này hỏng, lượt vẫn đi tiếp
      outcome = {
        kind: 'Failed',
        reason: 'Error',
        errorName: errorNameOf(error),
      };
    }
    if (outcome.kind === 'Expired') summary.expired += 1;
    else if (outcome.kind === 'NotDue') summary.notDue += 1;
    else {
      summary.failed += 1;
      this.logFailure(lichHenId, outcome);
    }
  }

  // Chỉ mã lịch, lý do và tên lớp lỗi. `Busy` (tranh chấp khoá, đã thử lại hết lượt) là tạm thời nên chỉ cảnh báo; còn lại là ERROR cần người xem
  // (dữ liệu lệch lặp lại mỗi phút cho tới khi sửa, TECH_DEBT dòng 100).
  private logFailure(
    lichHenId: string,
    failure: Extract<ExpireOutcome, { kind: 'Failed' }>,
  ): void {
    const message = `Không hết hạn được lịch ${lichHenId}: ${failure.reason} (${failure.errorName})`;
    if (failure.reason === 'Busy') {
      this.logger.warn(`${message}; giao dịch đã hoàn tác, lượt sau thử lại`);
    } else {
      this.logger.error(message);
    }
  }

  private report(summary: HoldExpirySummary, completed: boolean): void {
    const { expired, notDue, failed, more } = summary;
    if (expired + notDue + failed === 0) {
      if (completed) {
        this.logger.debug('Hết hạn giữ chỗ: không có lịch nào quá hạn');
      }
      return;
    }
    this.logger.log(
      `Hết hạn giữ chỗ: đã huỷ ${String(expired)}, bỏ qua ${String(notDue)}, lỗi ${String(failed)}${more ? '; còn ứng viên chờ lượt sau' : ''}`,
    );
  }
}
