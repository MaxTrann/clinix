import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  PUBLIC_DOCTOR_CONDITION,
  PUBLIC_DOCTOR_FROM,
} from '../common/public-doctor.sql.js';

/**
 * Câu lọc "bác sĩ nào trong danh sách là CÔNG KHAI": đúng hằng `PUBLIC_DOCTOR_CONDITION` như danh sách, chi tiết và đếm (H5),
 * nên một bác sĩ ẩn ở nơi khác thì ẩn ở đây. Chỉ đọc, không khoá; id đi qua tham số `?`. Id trả về là chuỗi (bigint).
 */
export const publicDoctorIdsSql = (count: number): string =>
  `SELECT CAST(b.tai_khoan_id AS CHAR) AS bacSiId
   FROM ${PUBLIC_DOCTOR_FROM}
   WHERE ${PUBLIC_DOCTOR_CONDITION}
     AND b.tai_khoan_id IN (${Array.from({ length: count }, () => '?').join(', ')})`;

@Injectable()
export class PublicSlotRepository {
  /** Chạy trong `em` của người gọi (cùng giao dịch chỉ đọc với reader khung giờ). Trả các id công khai THEO THỨ TỰ `ids`. */
  async findPublicIds(
    em: EntityManager,
    ids: readonly string[],
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await em.query<{ bacSiId: string }[]>(
      publicDoctorIdsSql(ids.length),
      [...ids],
    );
    const visible = new Set(rows.map((row) => String(row.bacSiId)));
    return ids.filter((id) => visible.has(id));
  }
}
