import { Injectable } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';

// Câu SQL của ẨN đánh giá (doctor-exam B8; PLAN 5.3 dòng KDD (ẩn), 5.8; KDD-04, KDD-07, KDD-14, KDD-23, KDD-24). Mọi giá trị người dùng đi qua tham số `?`. Không ghi log: lý do ẩn là dữ liệu cá nhân.
// Thứ tự gọi: đọc thường NGOÀI giao dịch (phạm vi, chi nhánh và bác sĩ của lịch) ⇒ (trong `withBookingTransaction`) `lock` ⇒ `markHidden` ⇒ nhật ký. KHÔNG khoá hay ghi `lich_hen`: chi nhánh và bác sĩ của lịch bất biến
// sau khi đặt (HD-08 cấm `UPDATE lich_hen` ở `doctor/`), và `UPDATE bi_an, ly_do_an` không đụng cột khoá ngoại. Nếu sau này có luồng đổi `lich_hen.chi_nhanh_id` hay `bac_si_id` thì PHẢI đọc lại dưới khoá (như H8).

/** Đánh giá và hai cột của lịch mà phạm vi và nhật ký cần; BIGINT ra CHUỖI. */
export interface HideTarget {
  danhGiaId: string;
  /** `lich_hen.bac_si_id` (bác sĩ được đánh giá) */
  bacSiId: string;
  /** `lich_hen.chi_nhanh_id` (chi nhánh lúc đặt, bất biến: L10) */
  chiNhanhId: string;
}

// MỘT câu theo khoá chính của đánh giá nối lịch theo khoá chính của lịch. `CAST … AS CHAR`: id là `bigint`, driver có thể trả số.
export const READ_FOR_HIDE_SQL = `SELECT CAST(dg.danh_gia_bac_si_id AS CHAR) AS danhGiaId, CAST(lh.bac_si_id AS CHAR) AS bacSiId, CAST(lh.chi_nhanh_id AS CHAR) AS chiNhanhId
FROM danh_gia_bac_si dg
INNER JOIN lich_hen lh ON lh.lich_hen_id = dg.lich_hen_id
WHERE dg.danh_gia_bac_si_id = ?`;

// Khoá hàng đánh giá theo khoá chính (tầng 6b của PLAN 5.3). `bi_an` là `tinyint(1)` nên ra 0 hoặc 1.
export const LOCK_RATING_SQL = `SELECT CAST(bi_an AS UNSIGNED) AS biAn FROM danh_gia_bac_si WHERE danh_gia_bac_si_id = ? FOR UPDATE`;

// `bi_an = 1` là HẰNG, `ly_do_an` là tham số (CHECK `chk_danh_gia_an`); `AND bi_an = 0` là lớp bảo vệ THỨ HAI sau khi kiểm dưới khoá: chỉ đổi đúng cột `bi_an`, `ly_do_an` của đúng một hàng.
export const HIDE_RATING_SQL = `UPDATE danh_gia_bac_si SET bi_an = 1, ly_do_an = ? WHERE danh_gia_bac_si_id = ? AND bi_an = 0`;

interface TargetRow {
  danhGiaId: string;
  bacSiId: string;
  chiNhanhId: string;
}

@Injectable()
export class RatingHideRepository {
  /** Đọc THƯỜNG (không khoá) đánh giá `id` kèm chi nhánh và bác sĩ của lịch, hoặc `null` khi không có. */
  async readForHide(
    db: Pick<DataSource | EntityManager, 'query'>,
    id: string,
  ): Promise<HideTarget | null> {
    const rows = await db.query<TargetRow[]>(READ_FOR_HIDE_SQL, [id]);
    const row = rows[0];
    if (row === undefined) return null;
    return {
      danhGiaId: row.danhGiaId,
      bacSiId: row.bacSiId,
      chiNhanhId: row.chiNhanhId,
    };
  }

  /** Khoá hàng đánh giá `id` (`FOR UPDATE`) và cho biết đã ẩn chưa; `null` khi không có hàng. Chỉ gọi TRONG giao dịch. */
  async lock(em: EntityManager, id: string): Promise<{ biAn: boolean } | null> {
    const rows = await em.query<{ biAn: number | string | boolean }[]>(
      LOCK_RATING_SQL,
      [id],
    );
    const row = rows[0];
    if (row === undefined) return null;
    return { biAn: Number(row.biAn) === 1 };
  }

  /** Ẩn đánh giá `id` với lý do ĐÃ chuẩn hoá; trả số hàng đổi (1 khi thành công, 0 khi đã ẩn). */
  async markHidden(
    em: EntityManager,
    id: string,
    reason: string,
  ): Promise<number> {
    const result: { affectedRows?: number } = await em.query(HIDE_RATING_SQL, [
      reason,
      id,
    ]);
    return result.affectedRows ?? 0;
  }
}
