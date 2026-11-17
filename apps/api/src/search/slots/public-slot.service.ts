import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import { nowVN, todayVN } from '../../common/time/time.js';
import { AvailableSlotsReader } from '../../scheduling/slots/available-slots.reader.js';
import type {
  PublicSlotQueryDto,
  PublicSlotsResponse,
} from './public-slot.dto.js';
import { parseSlotQuery } from './public-slot-query.parser.js';
import { assembleItems } from './public-slot.mapper.js';
import { PublicSlotRepository } from './public-slot.repository.js';

@Injectable()
export class PublicSlotService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    private readonly repository: PublicSlotRepository,
    private readonly slots: AvailableSlotsReader,
  ) {}

  /**
   * Khung giờ của các bác sĩ CÔNG KHAI trong MỘT ngày (PLAN search 5.6). `now` là MỘT mốc cho cả request (cửa sổ ngày, hết hạn giữ chỗ, quá giờ);
   * controller không truyền nên lấy `nowVN()` (test ghim `now`). Chỉ đọc, không khoá.
   * Sai tham số ⇒ 400 TRƯỚC khi chạm DB. Câu lọc công khai và 3 câu của reader chạy trong MỘT giao dịch chỉ đọc `REPEATABLE READ`
   * (cùng một ảnh chụp: không thấy "nửa vời" nếu có người đặt, huỷ hay đổi lịch xen giữa các câu).
   */
  async list(
    query: Pick<PublicSlotQueryDto, 'bacSiIds' | 'ngay'>,
    now: Date = nowVN(),
  ): Promise<PublicSlotsResponse> {
    const { bacSiIds, ngay } = parseSlotQuery(query, todayVN(now));
    const days = await runReadOnly(this.db, async (em) => {
      const visible = await this.repository.findPublicIds(em, bacSiIds);
      // Reader KHÔNG lọc công khai và không biết bác sĩ nào ẩn, nên chỉ đưa id công khai vào; id ẩn nhận phần tử "không có lịch" ở mapper.
      return visible.length === 0
        ? []
        : this.slots.listMany({ bacSiIds: visible, ngay, now }, em);
    });
    return { ngay, items: assembleItems(bacSiIds, days) };
  }
}
