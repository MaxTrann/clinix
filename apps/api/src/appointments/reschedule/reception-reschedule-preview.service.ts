import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { nowVN, toSecond } from '../../common/time/time.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import { resolveReceptionBranch } from '../reception-branch.js';
import type { ReschedulePreviewCandidate } from './patient-reschedule.dto.js';
import { toPreviewCandidate } from './patient-reschedule.mapper.js';
import type { ReceptionReschedulePreviewResult } from './reception-reschedule.dto.js';
import { toReceptionPreviewResult } from './reception-reschedule.mapper.js';
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
 * `GET /reception/appointments/:maLichHen/reschedule-preview[?khungGioId=]` (reschedule B7; PLAN reschedule 5.5 (Q2), 5.8; TRACKING reschedule 1.11). CHỈ ĐỌC: MỘT lần `runReadOnly` (REPEATABLE READ, READ ONLY),
 * không `FOR UPDATE`, không `FOR SHARE`, không ghi. KHÔNG có bộ luật thứ hai: chỉ gọi `evaluateRescheduleAvailability` (cùng hàm với `choPhepDoiLich` của chi tiết lịch Lễ tân nên hai nơi không lệch nhau, HDL-29) và
 * `evaluateReschedulability` (cùng hàm với `POST`) rồi đổi hình dạng bằng `reception-reschedule.mapper.ts`. Cùng khung với `ReschedulePreviewService` của B6, khác ở `actor` `DoiHo` (phạm vi chi nhánh, hạn là giờ hẹn
 * cộng `check_in_sau_phut`, không hạn mức) và ở tập khoá phản hồi.
 *  - Chi nhánh CHỈ từ `ReceptionScopeService` (đọc DB mỗi request): không hợp lệ ⇒ 403 `KHONG_DU_QUYEN` TRƯỚC mọi thứ khác.
 *  - Không `khungGioId`: `RescheduleReader.readAvailability`; `lichMoi` là `null`.
 *  - Có `khungGioId`: `RescheduleReader.read(…, 'none')`; `lichMoi.hopLe` theo bộ luật ĐẦY ĐỦ (đổi hộ không có `requestReasonGiven` ảnh hưởng: chỉ `TuDoi` mới bị hạn mức).
 * Lịch không xem được (không có, ngoài chi nhánh) ⇒ 404 `KHONG_TIM_THAY` cùng thân. Lịch `DaDoiLich` NHÌN THẤY được với nhân sự nên ra 200 `choPhepDoi: false` (`LICH_HEN_KHONG_CHO_DOI`), không 404. Khung giờ
 * không tồn tại ⇒ 404 `KHUNG_GIO_KHONG_TON_TAI` (không có giờ để trả `lichMoi.thoiGian`), đứng TRƯỚC lỗi của lịch (như B6). Cấu hình thiếu ⇒ 409 `HE_THONG_CHUA_CAU_HINH`. Mọi lỗi ném SAU khi giao dịch đã đóng.
 * Không log (mã lịch, id là dữ liệu cá nhân).
 */
@Injectable()
export class ReceptionReschedulePreviewService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(ReceptionScopeService)
    private readonly scopes: ReceptionScopeService,
    @Inject(RescheduleReader) private readonly reader: RescheduleReader,
  ) {}

  /** `maLichHen` đã qua `ParseAppointmentCodePipe`; `accountId` chỉ từ access token; `khungGioId` đã qua DTO (id BIGINT dạng chuỗi) hoặc vắng. */
  async preview(
    accountId: string,
    maLichHen: string,
    khungGioId: string | undefined,
  ): Promise<ReceptionReschedulePreviewResult> {
    const { chiNhanhId } = await resolveReceptionBranch(this.scopes, accountId);
    const config = await this.reader.config();
    const now = toSecond(nowVN());
    const actor: RescheduleActor = { via: 'DoiHo', chiNhanhId };

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
    // Không có lịch hay ngoài chi nhánh: CÙNG một 404 (H10)
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

    return toReceptionPreviewResult({
      availability,
      source,
      candidate,
      serverTime: nowVN(),
    });
  }
}
