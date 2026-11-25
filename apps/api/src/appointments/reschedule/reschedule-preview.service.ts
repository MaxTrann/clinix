import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { nowVN, toSecond } from '../../common/time/time.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import type {
  ReschedulePreviewCandidate,
  ReschedulePreviewResult,
} from './patient-reschedule.dto.js';
import {
  toPreviewCandidate,
  toPreviewResult,
} from './patient-reschedule.mapper.js';
import {
  evaluateReschedulability,
  evaluateRescheduleAvailability,
} from './reschedulability.rules.js';
import { rescheduleFailureException } from './reschedule-failure.js';
import { RescheduleReader } from './reschedule.reader.js';
import type {
  ReschedulabilityFacts,
  RescheduleActor,
} from './reschedule.types.js';

/**
 * `GET /patient/appointments/:maLichHen/reschedule-preview[?khungGioId=]` (reschedule B6; PLAN reschedule 5.5 (Q2), 5.8; TRACKING reschedule 1.10). CHỈ ĐỌC: MỘT lần `runReadOnly` (REPEATABLE READ,
 * READ ONLY), không `FOR UPDATE`, không `FOR SHARE`, không ghi (DLH-23). KHÔNG có bộ luật thứ hai: chỉ gọi `evaluateRescheduleAvailability` (cùng hàm với `choPhepDoiLich` của chi tiết lịch, nên hai nơi không
 * lệch nhau, HDL-25) và `evaluateReschedulability` (cùng hàm với `POST`) rồi đổi hình dạng bằng `patient-reschedule.mapper.ts`.
 *  - Không `khungGioId`: `RescheduleReader.readAvailability` (không đọc khung giờ nào); `lichMoi` là `null`.
 *  - Có `khungGioId`: `RescheduleReader.read(…, 'none')` với `requestReasonGiven: true` (hết lần tự đổi vẫn hỏi "gửi yêu cầu được không", không báo `VUOT_SO_LAN_TU_DOI`); `lichMoi.hopLe` theo bộ luật ĐẦY ĐỦ.
 * Lịch không xem được (không có, của người khác, ngoài phạm vi, `DaDoiLich`) ⇒ 404 `KHONG_TIM_THAY` cùng thân. Khung giờ không tồn tại ⇒ 404 `KHUNG_GIO_KHONG_TON_TAI` (không có giờ để trả `lichMoi.thoiGian`),
 * đứng TRƯỚC lỗi của lịch (khác thứ tự lỗi của POST, ghi ở TRACKING 1.10). Cấu hình thiếu ⇒ 409 `HE_THONG_CHUA_CAU_HINH` (`config()`, KHÔNG `tryConfig()`). Mọi lỗi ném SAU khi giao dịch đã đóng.
 * Không log (mã lịch, id là dữ liệu cá nhân).
 */
@Injectable()
export class ReschedulePreviewService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(RescheduleReader) private readonly reader: RescheduleReader,
  ) {}

  /** `maLichHen` đã qua `ParseAppointmentCodePipe`; `accountId` chỉ từ access token; `khungGioId` đã qua DTO (id BIGINT dạng chuỗi) hoặc vắng. */
  async preview(
    accountId: string,
    maLichHen: string,
    khungGioId: string | undefined,
  ): Promise<ReschedulePreviewResult> {
    const config = await this.reader.config();
    const now = toSecond(nowVN());
    const actor: RescheduleActor = { via: 'TuDoi', accountId };

    // `full` chỉ có khi hỏi kèm khung giờ (dữ kiện đã đọc khung giờ đích); `facts` đủ cho điều kiện đổi của lịch
    const read = await runReadOnly(this.db, async (em) => {
      if (khungGioId === undefined)
        return {
          facts: await this.reader.readAvailability(em, {
            actor,
            maLichHen,
            now,
            config,
          }),
          full: null,
        };
      const full: ReschedulabilityFacts = (
        await this.reader.read(
          em,
          {
            actor,
            maLichHen,
            khungGioMoiId: khungGioId,
            now,
            config,
            requestReasonGiven: true,
          },
          'none',
        )
      ).facts;
      return { facts: full, full };
    });

    const availability = evaluateRescheduleAvailability(read.facts);
    const source = read.facts.source;
    // Không có lịch, của người khác, ngoài phạm vi, hay `DaDoiLich`: CÙNG một 404 (H10, Q31, R7)
    if (source === null || availability.failure?.kind === 'NotFound')
      throw rescheduleFailureException({ kind: 'NotFound' });

    let candidate: ReschedulePreviewCandidate | null = null;
    if (read.full !== null) {
      // Khung giờ không tồn tại ⇒ 404 `KHUNG_GIO_KHONG_TON_TAI`: không có giờ để vẽ `lichMoi`
      if (read.full.bookability === null)
        throw rescheduleFailureException({ kind: 'SlotNotFound' });
      candidate = toPreviewCandidate(
        read.full.bookability.slot,
        evaluateReschedulability(read.full),
      );
    }

    return toPreviewResult({
      availability,
      source,
      candidate,
      serverTime: nowVN(),
    });
  }
}
