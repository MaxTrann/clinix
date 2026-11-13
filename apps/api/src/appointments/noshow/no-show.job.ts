import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { nowVN, toSecond } from '../../common/time/time.js';
import { NO_SHOW_CRON, NO_SHOW_JOB_NAME } from '../appointments.constants.js';
import { errorNameOf } from '../state/appointment-transition.service.js';
import {
  emptyNoShowSummary,
  NoShowSweepService,
  type NoShowSummary,
} from './no-show-sweep.service.js';

/**
 * Job tự đánh dấu Vắng mặt (task B13; PLAN booking 5.7, Q23; VM-01…VM-16; TRACKING 3.29 B13-C, B13-G). Lớp chạy theo lịch (`*.job.ts`) MỎNG, theo nếp `HoldExpiryJob` của B9: mỗi 5 phút gọi
 * `NoShowSweepService.sweep(now)` (chọn lịch `DaXacNhan` mà ca đã kết thúc, đánh Vắng mặt từng lịch trong giao dịch riêng bằng `markNoShow`) rồi ghi log tổng kết.
 *  - MỘT mốc `now` (đã cắt xuống giây) cho cả lượt: câu chọn và mọi `isDue` dùng cùng mốc, nên kết quả xác định (test đưa mốc giả vào `run(now)`).
 *  - Chống chạy chồng trong cùng tiến trình bằng cờ `running` (lượt trước chưa xong thì bỏ qua lượt này); hai bản API cùng chạy vẫn đúng nhờ kiểm lại dưới khoá, không cần khoá riêng.
 *  - `run` KHÔNG BAO GIỜ ném (framework log nguyên đối tượng lỗi, kể cả message): lỗi đọc cấu hình hay danh sách ứng viên (DB sập) được nuốt và ghi ERROR chỉ có tên lớp lỗi.
 *
 * Log CHỈ có số lượng, mã lịch (ở `NoShowSweepService`), lý do và tên lớp lỗi: không bao giờ có email, họ tên, SĐT hay `error.message`. Cảnh báo "ca không có khoảng" là MỘT con số cho cả lượt (không ghi từng
 * lịch) và chỉ ghi khi số đó ĐỔI so với lượt trước: lịch `CaToi` đã qua giờ hẹn còn `DaXacNhan` cho tới khi Lễ tân hay Quản trị viên xử lý, ghi mỗi 5 phút là 288 dòng một ngày.
 *
 * Lịch: `ScheduleModule.forRoot()` chỉ được gọi MỘT lần, ở `app.module.ts`; KHÔNG gọi lần nữa ở đây (mỗi lần gọi là một module riêng nên mọi job chạy gấp đôi, TECH_DEBT dòng 33) và `AppointmentsModule` không
 * import `ScheduleModule` (AR-03). Tắt ở NODE_ENV=test để job không tự chạy giữa các test dựng AppModule; test gọi `run(now)` trực tiếp (VM-16).
 */
@Injectable()
export class NoShowJob {
  private readonly logger = new Logger(NoShowJob.name);
  private running = false;
  // Số "ca không có khoảng" của lượt hoàn tất gần nhất (0 khi mới khởi động: lần đầu có > 0 thì cảnh báo)
  private lastUnattended = 0;

  constructor(
    @Inject(NoShowSweepService)
    private readonly sweepService: NoShowSweepService,
  ) {}

  /**
   * Trả tóm tắt lượt vừa chạy; `undefined` nếu lượt này bị bỏ qua vì lượt trước (cùng tiến trình) còn chạy.
   * Bộ lập lịch gọi hàm này KÈM ĐỐI SỐ của thư viện `cron` (`onComplete`, hiện là `undefined`): chỉ nhận `now` khi nó đúng là `Date`, còn lại lấy đồng hồ, để một đối số lạ không biến thành mốc rác.
   */
  @Cron(NO_SHOW_CRON, {
    name: NO_SHOW_JOB_NAME,
    disabled: process.env.NODE_ENV === 'test',
  })
  async run(now?: Date): Promise<NoShowSummary | undefined> {
    if (this.running) {
      this.logger.warn('Lượt tự Vắng mặt trước vẫn đang chạy: bỏ qua lượt này');
      return undefined;
    }
    this.running = true;
    const summary = emptyNoShowSummary();
    let completed = false;
    try {
      await this.sweepService.sweep(
        toSecond(now instanceof Date ? now : nowVN()),
        summary,
      );
      completed = true;
    } catch (error) {
      // Lỗi đọc dữ liệu (cấu hình, danh sách ứng viên, câu đếm): nuốt ở đây, KHÔNG ném lên framework. Phần đã đánh trước đó vẫn nằm trong `summary`.
      this.logger.error(
        `Tự Vắng mặt: lượt bị dừng vì lỗi đọc dữ liệu (${errorNameOf(error)})`,
      );
    } finally {
      this.running = false;
    }
    this.report(summary, completed);
    return summary;
  }

  private report(summary: NoShowSummary, completed: boolean): void {
    if (summary.configMissing) {
      this.logger.warn(
        'Tự Vắng mặt: chưa có cấu hình hệ thống, bỏ lượt (không đoán ngưỡng no-show)',
      );
      return;
    }
    // Chỉ lượt hoàn tất mới có số đếm đáng tin (lượt dừng giữa chừng để `unattended` = 0 mặc định)
    if (completed) this.reportUnattended(summary.unattended);
    const { noShowed, notConfirmed, notDue, failedBusy, failedError, more } =
      summary;
    const failed = failedBusy + failedError;
    if (noShowed + notConfirmed + notDue + failed === 0) {
      if (completed)
        this.logger.debug('Tự Vắng mặt: không có lịch nào đến hạn');
      return;
    }
    this.logger.log(
      `Tự Vắng mặt: đã đánh ${String(noShowed)}, không còn DaXacNhan ${String(notConfirmed)}, chưa đến hạn ${String(notDue)}, lỗi ${String(failed)} (bận ${String(failedBusy)}, khác ${String(failedError)})${more ? '; còn ứng viên chờ lượt sau' : ''}`,
    );
  }

  private reportUnattended(unattended: number): void {
    if (unattended === this.lastUnattended) return;
    this.lastUnattended = unattended;
    if (unattended > 0)
      this.logger.warn(
        `Tự Vắng mặt: ${String(unattended)} lịch DaXacNhan đã quá giờ hẹn nhưng ca không có giờ kết thúc (ca tối hay chi nhánh không có khoảng nhận khám): không tự đánh, cần Lễ tân hay Quản trị viên xử lý`,
      );
  }
}
