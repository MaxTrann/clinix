import { Inject, Injectable, Logger } from '@nestjs/common';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import type { CaLamViec } from '../../scheduling/branch-hours/branch-hours.types.js';
import {
  APPOINTMENT_CANCELLATION_PORT,
  type AppointmentCancellationPort,
} from './appointment-cancellation.port.js';

/** Khoảng nghỉ của một yêu cầu đã duyệt (đủ để tìm lịch bị ảnh hưởng; không có lý do nghỉ của Bác sĩ). */
export interface ApprovedLeave {
  bacSiId: string;
  /** `YYYY-MM-DD` */
  tuNgay: string;
  denNgay: string;
  /** `null` = nghỉ cả ngày */
  ca: CaLamViec | null;
}

/** Kết quả bước 2 của Duyệt (PLAN 5.8 mục 3). */
export interface CancellationSummary {
  /** `false` khi có lỗi bất ngờ: còn lịch chưa xử lý xong, sweeper (B16) hoặc "Xử lý lại" sẽ chạy lại. */
  hoanTat: boolean;
  daHuy: number;
  /** Đã `DaHuy` từ trước (người khác huỷ, hay lượt trước): coi là thành công (HD-07). */
  daHuyTruocDo: number;
  /** Lịch mà ma trận trạng thái không cho huỷ (ví dụ vừa được tiếp đón). */
  khongHuyDuoc: { maLichHen: string; trangThai: TrangThaiLichHen }[];
}

/**
 * Bước 2 của Duyệt (PLAN doctor 5.8, 5.9; Q29, D5): tìm lịch bị ảnh hưởng rồi huỷ TUẦN TỰ từng lịch qua `booking`.
 * Chạy SAU commit của bước 1 và không giữ khoá nào của module này. Hội tụ khi chạy lại: từ lúc `DaDuyet` commit, đặt lịch mới vào khoảng nghỉ bị chặn (D4),
 * nên tập "bị ảnh hưởng" chỉ co lại. Dùng lại ở B16 (sweeper, "Xử lý lại").
 */
@Injectable()
export class LeaveCancellationRunner {
  private readonly logger = new Logger(LeaveCancellationRunner.name);

  constructor(
    @Inject(APPOINTMENT_CANCELLATION_PORT)
    private readonly port: AppointmentCancellationPort,
  ) {}

  async run(leave: ApprovedLeave, now: Date): Promise<CancellationSummary> {
    const summary: CancellationSummary = {
      hoanTat: true,
      daHuy: 0,
      daHuyTruocDo: 0,
      khongHuyDuoc: [],
    };
    let affected;
    try {
      affected = await this.port.findAffected({
        bacSiId: leave.bacSiId,
        tuNgay: leave.tuNgay,
        denNgay: leave.denNgay,
        ...(leave.ca === null ? {} : { ca: leave.ca }),
        now,
      });
    } catch (error) {
      this.warn(error, 0, 0);
      return { ...summary, hoanTat: false };
    }

    let failed = 0;
    let lastError: unknown;
    for (const { maLichHen } of affected) {
      try {
        const outcome = await this.port.cancelForLeave(maLichHen);
        switch (outcome.kind) {
          case 'Cancelled':
            summary.daHuy += 1;
            break;
          case 'AlreadyCancelled':
            summary.daHuyTruocDo += 1;
            break;
          case 'NotCancellable':
            summary.khongHuyDuoc.push({
              maLichHen,
              trangThai: outcome.trangThai,
            });
            break;
          case 'NotFound':
            // Lịch biến mất giữa lúc tìm và lúc huỷ: không còn gì để huỷ.
            break;
        }
      } catch (error) {
        // Một lịch lỗi (ví dụ 503 HE_THONG_DANG_BAN) không dừng các lịch còn lại; lượt chạy lại sẽ xử lý nó.
        failed += 1;
        summary.hoanTat = false;
        lastError = error;
      }
    }
    if (failed > 0) this.warn(lastError, failed, affected.length);
    return summary;
  }

  /** Log CHỈ có số đếm và tên lớp lỗi: không tên bệnh nhân, không mã lịch hẹn, không lý do (Q29, PD-12). */
  private warn(error: unknown, failed: number, total: number): void {
    const kind = error instanceof Error ? error.name : typeof error;
    this.logger.warn(
      `Huỷ lịch hẹn do nghỉ phép chưa hoàn tất: lỗi ${failed}/${total} lịch (${kind})`,
    );
  }
}
