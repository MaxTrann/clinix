import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { CaLamViec } from '../branch-hours/branch-hours.types.js';

/** Một ca đã phân công. Ngày là chuỗi 'YYYY-MM-DD'; id bigint là chuỗi. */
export interface ShiftRef {
  lichLamViecId: string;
  ngay: string;
  ca: CaLamViec;
}

/** Ca kèm chi nhánh GHI TRÊN CA (không đổi khi bác sĩ chuyển chi nhánh). */
export interface DoctorShift extends ShiftRef {
  chiNhanhId: string;
  chiNhanhTen: string;
}

// DATE_FORMAT để lấy chuỗi ngày, không để driver đổi cột DATE thành `Date` (lệch 1 ngày tuỳ múi giờ: H1, M4).
const SELECT_SHIFT = `
  SELECT CAST(lv.lich_lam_viec_id AS CHAR) AS lichLamViecId, DATE_FORMAT(lv.ngay, '%Y-%m-%d') AS ngay, lv.ca AS ca`;

/**
 * Một cách đọc `lich_lam_viec` dùng chung (PLAN doctor 5.10 E): Bác sĩ xem lịch (B7), và `admin` B13 khi đổi chi nhánh bác sĩ.
 * Chỉ ĐỌC, dùng `em` của bên gọi; không khoá.
 */
@Injectable()
export class ShiftQueries {
  /**
   * Ca của bác sĩ tại một chi nhánh từ `tuNgay` trở đi. Ca HÔM NAY tính là còn (`ngay >= tuNgay`, quy tắc 13),
   * ca quá khứ và chi nhánh khác thì không.
   */
  async findFutureShiftsAtBranch(
    em: EntityManager,
    input: { bacSiId: string; chiNhanhId: string; tuNgay: string },
  ): Promise<ShiftRef[]> {
    return em.query(
      `${SELECT_SHIFT}
         FROM lich_lam_viec lv
        WHERE lv.bac_si_id = ? AND lv.chi_nhanh_id = ? AND lv.ngay >= ?
        ORDER BY lv.ngay ASC, lv.ca ASC`,
      [input.bacSiId, input.chiNhanhId, input.tuNgay],
    );
  }

  /**
   * Ca của NHIỀU bác sĩ trong [tuNgay, denNgay] (một truy vấn cho cả trang lưới). Có `chiNhanhId` thì CHỈ lấy ca mang chi nhánh đó:
   * lọc nằm trong SQL, không lọc sau, để ca ngoài phạm vi không bao giờ rời DB (H10).
   */
  async listShiftsOfDoctors(
    em: EntityManager,
    input: {
      bacSiIds: readonly string[];
      tuNgay: string;
      denNgay: string;
      chiNhanhId?: string;
    },
  ): Promise<(DoctorShift & { bacSiId: string })[]> {
    if (input.bacSiIds.length === 0) return [];
    const branch =
      input.chiNhanhId === undefined ? '' : ' AND lv.chi_nhanh_id = ?';
    return em.query(
      `${SELECT_SHIFT}, CAST(lv.bac_si_id AS CHAR) AS bacSiId, CAST(lv.chi_nhanh_id AS CHAR) AS chiNhanhId, cn.ten AS chiNhanhTen
         FROM lich_lam_viec lv
         JOIN chi_nhanh cn ON cn.chi_nhanh_id = lv.chi_nhanh_id
        WHERE lv.bac_si_id IN (${input.bacSiIds.map(() => '?').join(', ')}) AND lv.ngay >= ? AND lv.ngay <= ?${branch}
        ORDER BY lv.bac_si_id ASC, lv.ngay ASC, lv.ca ASC`,
      [
        ...input.bacSiIds,
        input.tuNgay,
        input.denNgay,
        ...(input.chiNhanhId === undefined ? [] : [input.chiNhanhId]),
      ],
    );
  }

  /** Mọi ca của bác sĩ trong [tuNgay, denNgay] (gồm hai đầu), kèm chi nhánh trên ca. Dùng chỉ mục `(bac_si_id, ngay, ca)`. */
  async listDoctorShifts(
    em: EntityManager,
    input: { bacSiId: string; tuNgay: string; denNgay: string },
  ): Promise<DoctorShift[]> {
    return em.query(
      `${SELECT_SHIFT}, CAST(lv.chi_nhanh_id AS CHAR) AS chiNhanhId, cn.ten AS chiNhanhTen
         FROM lich_lam_viec lv
         JOIN chi_nhanh cn ON cn.chi_nhanh_id = lv.chi_nhanh_id
        WHERE lv.bac_si_id = ? AND lv.ngay >= ? AND lv.ngay <= ?
        ORDER BY lv.ngay ASC, lv.ca ASC`,
      [input.bacSiId, input.tuNgay, input.denNgay],
    );
  }
}
