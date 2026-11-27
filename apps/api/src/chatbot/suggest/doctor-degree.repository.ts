import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { HOC_VI_BAC_SI, type HocViBacSi } from '../../admin/entities/enums.js';

// Đọc học vị của bác sĩ để xếp hạng gợi ý (chatbot B4; PLAN chatbot 5.11 bước 6, T7). API công khai KHÔNG trả học vị (danh sách trắng Q14 của search)
// nên đọc thẳng cột `bac_si.hoc_vi`. Học vị chỉ đi vào `ranking.rules.ts` và KHÔNG bao giờ ra thân trả về (GOI-09).
// Chỉ đọc, chạy trong giao dịch chỉ đọc của bên gọi (`manager`); không khoá, không ghi.

type DegreeRow = { bacSiId: string; hocVi: string };

const isDegree = (value: string): value is HocViBacSi =>
  (HOC_VI_BAC_SI as readonly string[]).includes(value);

@Injectable()
export class DoctorDegreeRepository {
  /** Học vị theo id bác sĩ (id chuỗi). Id không có hay học vị lạ thì vắng mặt trong kết quả (quy đổi 0). Danh sách rỗng ⇒ không chạy SQL. */
  async readDegrees(
    manager: EntityManager,
    ids: readonly string[],
  ): Promise<Map<string, HocViBacSi>> {
    const result = new Map<string, HocViBacSi>();
    if (ids.length === 0) return result;
    const rows = await manager.query<DegreeRow[]>(
      `SELECT CAST(tai_khoan_id AS CHAR) AS bacSiId, hoc_vi AS hocVi
       FROM bac_si WHERE tai_khoan_id IN (?)`,
      [ids],
    );
    for (const row of rows) {
      if (isDegree(row.hocVi)) result.set(String(row.bacSiId), row.hocVi);
    }
    return result;
  }
}
