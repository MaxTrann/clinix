import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { nowVN, todayVN, toSecond } from '../../common/time/time.js';
import {
  LEAVE_SWEEPER_BATCH_SIZE,
  LEAVE_SWEEPER_CRON,
  LEAVE_SWEEPER_JOB_NAME,
  LEAVE_SWEEPER_MAX_BATCHES,
} from './admin-leave.constants.js';
import { AdminLeaveRepository } from './admin-leave.repository.js';
import { LeaveCancellationRunner } from './leave-cancellation.runner.js';

export interface LeaveSweeperSummary {
  /** Số yêu cầu `DaDuyet` còn hiệu lực đã chạy lại trong lượt này */
  requests: number;
  daHuy: number;
  daHuyTruocDo: number;
  khongHuyDuoc: number;
  /** Số yêu cầu mà bước huỷ chưa hoàn tất (có lỗi bất ngờ); lượt sau chạy lại */
  chuaHoanTat: number;
  /** Có thể còn yêu cầu chưa tới lượt vì đã hết trần số lô */
  more: boolean;
}

/**
 * Chạy lại bước huỷ lịch hẹn của các yêu cầu nghỉ đã duyệt (B16; PLAN doctor 5.8, Q29; booking DT-17, H9). Cứu trường hợp tiến trình chết, hoặc `cancel` lỗi, sau khi `DaDuyet` đã commit.
 * Theo nếp `HoldExpiryJob` của booking.
 *
 * Mỗi lượt: quét theo lô (`LEAVE_SWEEPER_BATCH_SIZE`, tối đa `LEAVE_SWEEPER_MAX_BATCHES` lô, con trỏ là id yêu cầu) các yêu cầu `DaDuyet` có `ngay_ket_thuc >= hôm nay`, rồi gọi
 * `LeaveCancellationRunner.run` cho TỪNG yêu cầu: một yêu cầu một lần chạy, lỗi một yêu cầu không dừng lượt (runner không ném).
 *  - Điều kiện DỪNG: yêu cầu qua `ngay_ket_thuc` thì không còn được quét; `findAffectedByLeave` rỗng thì chạy không làm gì (rẻ nhờ chỉ mục `lich_hen (bac_si_id, thoi_gian)`, M10).
 *    Hội tụ vì từ lúc `DaDuyet` commit, đặt lịch mới vào khoảng nghỉ bị chặn (D4), nên tập "bị ảnh hưởng" chỉ co lại. Không đánh dấu "xong" (schema không có cột).
 *  - Hai bản sweeper (hai bản API, hay sweeper và nút "Xử lý lại") chạy cùng lúc là an toàn, không cần khoá riêng: mỗi lịch chỉ được huỷ MỘT lần vì `cancel` của booking khoá khung giờ rồi lịch,
 *    bên sau thấy `DaHuy` và trả `AlreadyCancelled` (không hoàn tiền hay mời chờ lần hai). Module này không giữ khoá nào trong lúc gọi booking (PLAN 5.9).
 *  - Cờ `running` chỉ chống chạy chồng trong cùng tiến trình.
 *  - Không ghi nhật ký: không có người thực hiện (`tai_khoan_id` NOT NULL); dấu vết là chính các `lich_hen` đã huỷ (giống `UnverifiedPatientCleanupJob`).
 * Log CHỈ có số đếm và tên lớp lỗi: không tên bệnh nhân, không mã lịch hẹn, không lý do. `run` không bao giờ ném (framework sẽ log nguyên đối tượng lỗi, kể cả message).
 *
 * Lịch: KHÔNG gọi `ScheduleModule.forRoot()` ở đây (đã gọi một lần ở `app.module.ts`; gọi thêm thì mọi job chạy gấp đôi, TECH_DEBT dòng 33). Tắt ở `NODE_ENV=test`: test gọi `run(now)` trực tiếp.
 */
@Injectable()
export class LeaveCancellationSweeper {
  private readonly logger = new Logger(LeaveCancellationSweeper.name);
  private running = false;

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(AdminLeaveRepository)
    private readonly repository: AdminLeaveRepository,
    @Inject(LeaveCancellationRunner)
    private readonly runner: LeaveCancellationRunner,
  ) {}

  /**
   * Trả tóm tắt lượt vừa chạy; `undefined` nếu lượt này bị bỏ qua vì lượt trước (cùng tiến trình) còn chạy.
   * Bộ lập lịch gọi hàm này KÈM ĐỐI SỐ của thư viện `cron`: chỉ nhận `now` khi nó đúng là `Date`, còn lại lấy đồng hồ.
   */
  @Cron(LEAVE_SWEEPER_CRON, {
    name: LEAVE_SWEEPER_JOB_NAME,
    disabled: process.env.NODE_ENV === 'test',
  })
  async run(now?: Date): Promise<LeaveSweeperSummary | undefined> {
    if (this.running) {
      this.logger.warn(
        'Lượt chạy lại huỷ lịch nghỉ phép trước vẫn đang chạy: bỏ qua lượt này',
      );
      return undefined;
    }
    this.running = true;
    const summary: LeaveSweeperSummary = {
      requests: 0,
      daHuy: 0,
      daHuyTruocDo: 0,
      khongHuyDuoc: 0,
      chuaHoanTat: 0,
      more: false,
    };
    try {
      await this.sweep(toSecond(now instanceof Date ? now : nowVN()), summary);
    } catch (error) {
      // Lỗi đọc danh sách (DB sập…): nuốt ở đây, chỉ log tên lớp lỗi
      this.logger.error(
        `Chạy lại huỷ lịch nghỉ phép: không đọc được danh sách yêu cầu (${error instanceof Error ? error.name : typeof error})`,
      );
    } finally {
      this.running = false;
    }
    this.logger.log(
      `Chạy lại huỷ lịch nghỉ phép: ${summary.requests} yêu cầu, huỷ ${summary.daHuy}, đã huỷ trước ${summary.daHuyTruocDo}, không huỷ được ${summary.khongHuyDuoc}, chưa hoàn tất ${summary.chuaHoanTat}${summary.more ? ' (còn nữa)' : ''}`,
    );
    return summary;
  }

  private async sweep(now: Date, summary: LeaveSweeperSummary): Promise<void> {
    // MỘT mốc `now` cho cả lượt: cùng cận cho `findAffectedByLeave` ở mọi yêu cầu, và cùng "hôm nay" để chọn yêu cầu.
    const today = todayVN(now);
    let after: string | null = null;
    for (let batch = 0; batch < LEAVE_SWEEPER_MAX_BATCHES; batch++) {
      const rows = await this.repository.findApprovedActive(this.db.manager, {
        today,
        after,
        limit: LEAVE_SWEEPER_BATCH_SIZE,
      });
      for (const row of rows) {
        summary.requests += 1;
        try {
          const result = await this.runner.run(
            {
              bacSiId: row.bacSiId,
              tuNgay: row.tuNgay,
              denNgay: row.denNgay,
              ca: row.ca,
            },
            now,
          );
          summary.daHuy += result.daHuy;
          summary.daHuyTruocDo += result.daHuyTruocDo;
          summary.khongHuyDuoc += result.khongHuyDuoc.length;
          if (!result.hoanTat) summary.chuaHoanTat += 1;
        } catch {
          // `run` hứa không ném; nếu một ngày nào đó vi phạm thì chỉ yêu cầu này hỏng, lượt vẫn đi tiếp (PD-12)
          summary.chuaHoanTat += 1;
        }
        after = row.yeuCauNghiPhepId;
      }
      if (rows.length < LEAVE_SWEEPER_BATCH_SIZE) return;
    }
    summary.more = true;
  }
}
