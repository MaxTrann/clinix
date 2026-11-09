import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { BranchDayHours, ShiftRange } from './branch-hours.types.js';

export interface BranchWeekdayPair {
  chiNhanhId: string;
  thuTrongTuan: number;
}

interface HoursRow {
  chiNhanhId: string;
  thuTrongTuan: number | string;
  hoatDong: number | boolean;
  sangTu: number | string | null;
  sangDen: number | string | null;
  chieuTu: number | string | null;
  chieuDen: number | string | null;
}

/** Khóa tra trong kết quả của `loadMany`. */
export const hoursKey = (pair: BranchWeekdayPair): string =>
  `${pair.chiNhanhId}:${pair.thuTrongTuan}`;

function toRange(
  from: number | string | null,
  to: number | string | null,
): ShiftRange | null {
  return from === null || to === null
    ? null
    : { tuGiay: Number(from), denGiay: Number(to) };
}

/** Đọc giờ nhận khám của chi nhánh theo thứ ISO; TIME đổi sang giây ngay trong SQL (TIME_TO_SEC). Thiếu dòng ⇒ `null` (chưa khai báo). */
@Injectable()
export class BranchHoursReader {
  async load(
    em: EntityManager,
    chiNhanhId: string,
    thuTrongTuan: number,
  ): Promise<BranchDayHours | null> {
    const hours = await this.loadMany(em, [{ chiNhanhId, thuTrongTuan }]);
    return hours.get(hoursKey({ chiNhanhId, thuTrongTuan })) ?? null;
  }

  /** Một truy vấn cho mọi cặp (chi nhánh, thứ). Cặp không có dòng ⇒ `null` trong Map. */
  async loadMany(
    em: EntityManager,
    pairs: readonly BranchWeekdayPair[],
  ): Promise<Map<string, BranchDayHours | null>> {
    const unique = new Map(pairs.map((pair) => [hoursKey(pair), pair]));
    const result = new Map<string, BranchDayHours | null>(
      [...unique.keys()].map((key) => [key, null]),
    );
    if (unique.size === 0) return result;

    const conditions = [...unique.values()]
      .map(() => '(chi_nhanh_id = ? AND thu_trong_tuan = ?)')
      .join(' OR ');
    const params = [...unique.values()].flatMap((pair) => [
      pair.chiNhanhId,
      pair.thuTrongTuan,
    ]);
    const rows: HoursRow[] = await em.query(
      `SELECT chi_nhanh_id AS chiNhanhId, thu_trong_tuan AS thuTrongTuan, hoat_dong AS hoatDong,
              TIME_TO_SEC(gio_bat_dau_sang) AS sangTu, TIME_TO_SEC(gio_ket_thuc_sang) AS sangDen,
              TIME_TO_SEC(gio_bat_dau_chieu) AS chieuTu, TIME_TO_SEC(gio_ket_thuc_chieu) AS chieuDen
       FROM chi_nhanh_lich_hoat_dong WHERE ${conditions}`,
      params,
    );
    for (const row of rows) {
      result.set(
        hoursKey({
          chiNhanhId: String(row.chiNhanhId),
          thuTrongTuan: Number(row.thuTrongTuan),
        }),
        {
          hoatDong: Boolean(row.hoatDong),
          sang: toRange(row.sangTu, row.sangDen),
          chieu: toRange(row.chieuTu, row.chieuDen),
        },
      );
    }
    return result;
  }
}
