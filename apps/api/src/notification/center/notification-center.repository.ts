import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

// SQL của Trung tâm thông báo (notification B2; PLAN notification 5.4). Mọi câu tham số hoá và đều có `tai_khoan_id = ?` lấy từ token:
// thông báo của tài khoản khác không bao giờ được đọc hay đổi (TTB-05, TTB-07, QTB-03).
// Đây là NƠI DUY NHẤT của scope ghi `thong_bao`, và chỉ `UPDATE trang_thai_doc` (không INSERT, không DELETE: HTB-06).

/** Một hàng đọc ra; chưa ghép danh mục. `maLichHen` lấy qua JOIN, không trả `lich_hen_id`. */
export interface NotificationRow {
  id: string;
  loai: string;
  noiDung: string;
  daDoc: number | string;
  thoiDiemTao: Date;
  maLichHen: string | null;
}

/** Bộ lọc trạng thái đọc ở tầng SQL: `null` = không lọc. */
export type ReadFilter = 0 | 1 | null;

const SELECT_COLUMNS = `SELECT CAST(t.thong_bao_id AS CHAR) AS id, t.loai_su_kien AS loai, t.noi_dung AS noiDung, t.trang_thai_doc AS daDoc,
       t.thoi_diem_tao AS thoiDiemTao, lh.ma_lich_hen AS maLichHen
  FROM thong_bao t
  LEFT JOIN lich_hen lh ON lh.lich_hen_id = t.lich_hen_id`;

// Sắp mới nhất trước; `thong_bao_id DESC` là khoá phụ để thứ tự ổn định khi nhiều dòng cùng giây (TTB-13).
// Không lọc: dùng chỉ mục `thong_bao_index_tai_khoan_thoi_diem` (notification P2); có lọc: `thong_bao_index_25`. Cả hai không filesort (X1 M1, đo lại sau P2).
const ORDER_PAGE =
  'ORDER BY t.thoi_diem_tao DESC, t.thong_bao_id DESC LIMIT ? OFFSET ?';

export const LIST_SQL = `${SELECT_COLUMNS}
 WHERE t.tai_khoan_id = ?
 ${ORDER_PAGE}`;
export const LIST_FILTERED_SQL = `${SELECT_COLUMNS}
 WHERE t.tai_khoan_id = ? AND t.trang_thai_doc = ?
 ${ORDER_PAGE}`;
export const COUNT_SQL =
  'SELECT COUNT(*) AS total FROM thong_bao WHERE tai_khoan_id = ?';
export const COUNT_FILTERED_SQL =
  'SELECT COUNT(*) AS total FROM thong_bao WHERE tai_khoan_id = ? AND trang_thai_doc = ?';
export const UNREAD_COUNT_SQL =
  'SELECT COUNT(*) AS total FROM thong_bao WHERE tai_khoan_id = ? AND trang_thai_doc = 0';
export const DETAIL_SQL = `${SELECT_COLUMNS}
 WHERE t.thong_bao_id = ? AND t.tai_khoan_id = ?`;

// Đánh dấu MỘT: điều kiện sở hữu nằm TRONG chính câu UPDATE, không SELECT sở hữu riêng (Q11). Không có `AND trang_thai_doc = 0` để dòng đã đọc vẫn KHỚP:
// `mysql2` đếm hàng khớp (cờ CLIENT_FOUND_ROWS, X1 M4 (ii)) nên `affectedRows` = 1 cả khi đã đọc rồi (idempotent), = 0 khi không có hay của người khác.
export const MARK_READ_SQL =
  'UPDATE thong_bao SET trang_thai_doc = 1 WHERE thong_bao_id = ? AND tai_khoan_id = ?';

// Đánh dấu tất cả: từng lô theo khoá chính, mỗi lô một giao dịch READ COMMITTED riêng (R3; X1 M5: 0 lần 1213/1205, INSERT thông báo mới chờ ≤ 48 ms).
export const MARK_ALL_BATCH_SQL =
  'UPDATE thong_bao SET trang_thai_doc = 1 WHERE tai_khoan_id = ? AND trang_thai_doc = 0 ORDER BY thong_bao_id LIMIT ?';

const totalOf = (rows: { total: string | number }[]): number =>
  Number(rows[0]?.total ?? 0);

@Injectable()
export class NotificationCenterRepository {
  async list(
    em: EntityManager,
    input: {
      taiKhoanId: string;
      filter: ReadFilter;
      limit: number;
      offset: number;
    },
  ): Promise<NotificationRow[]> {
    const { taiKhoanId, filter, limit, offset } = input;
    return filter === null
      ? em.query(LIST_SQL, [taiKhoanId, limit, offset])
      : em.query(LIST_FILTERED_SQL, [taiKhoanId, filter, limit, offset]);
  }

  async count(
    em: EntityManager,
    taiKhoanId: string,
    filter: ReadFilter,
  ): Promise<number> {
    return totalOf(
      filter === null
        ? await em.query(COUNT_SQL, [taiKhoanId])
        : await em.query(COUNT_FILTERED_SQL, [taiKhoanId, filter]),
    );
  }

  async unreadCount(em: EntityManager, taiKhoanId: string): Promise<number> {
    return totalOf(await em.query(UNREAD_COUNT_SQL, [taiKhoanId]));
  }

  async findOne(
    em: EntityManager,
    id: string,
    taiKhoanId: string,
  ): Promise<NotificationRow | null> {
    const rows: NotificationRow[] = await em.query(DETAIL_SQL, [
      id,
      taiKhoanId,
    ]);
    return rows[0] ?? null;
  }

  /** true nếu có hàng KHỚP (của chính tài khoản), kể cả khi đã đọc từ trước. */
  async markRead(
    em: EntityManager,
    id: string,
    taiKhoanId: string,
  ): Promise<boolean> {
    const result: { affectedRows?: number } = await em.query(MARK_READ_SQL, [
      id,
      taiKhoanId,
    ]);
    return result.affectedRows === 1;
  }

  /** Số hàng vừa chuyển sang đã đọc ở lô này. */
  async markAllBatch(
    em: EntityManager,
    taiKhoanId: string,
    batchSize: number,
  ): Promise<number> {
    const result: { affectedRows?: number } = await em.query(
      MARK_ALL_BATCH_SQL,
      [taiKhoanId, batchSize],
    );
    return result.affectedRows ?? 0;
  }
}
