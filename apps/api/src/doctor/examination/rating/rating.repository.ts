import type { DataSource, EntityManager } from 'typeorm';
import type { RatingView } from './rating.dto.js';
import type { ValidRating } from './rating.rules.js';

// Câu SQL của gửi đánh giá (doctor-exam B6; PLAN 5.3, 5.7). KHÔNG khoá tường minh: `HoanThanh` là trạng thái cuối và chủ lịch bất biến (H8), đua hai lần gửi do UNIQUE `lich_hen_id` giải quyết.
// Thứ tự gọi (DGB-16): đọc thường lịch của chủ sở hữu NGOÀI giao dịch ⇒ (trong `withBookingTransaction`) `INSERT` ⇒ đọc lại bằng chính kết nối đó. KHÔNG `UPDATE lich_hen`, không bảng nào khác
// (không nhật ký, không thông báo: 5.7). `bi_an` và `ly_do_an` là HẰNG trong câu `INSERT` (CHECK `chk_danh_gia_an`), không bao giờ là tham số; SELECT KHÔNG lấy hai cột đó (Q19).

export interface OwnedForRating {
  lichHenId: string;
  trangThai: string;
}

// Chủ sở hữu ĐẦU TIÊN (`benh_nhan_id` = tài khoản ĐẶT, từ access token); `ma_lich_hen` UNIQUE ⇒ truy cập `const` (DGB-17). `CAST … AS CHAR`: id là `bigint`, driver có thể trả số.
export const READ_OWNED_FOR_RATING_SQL = `SELECT CAST(lich_hen_id AS CHAR) AS lichHenId, trang_thai AS trangThai
FROM lich_hen WHERE benh_nhan_id = ? AND ma_lich_hen = ?`;

export const INSERT_RATING_SQL = `INSERT INTO danh_gia_bac_si (lich_hen_id, so_sao, nhan_xet, bi_an, ly_do_an, thoi_diem_tao)
VALUES (?, ?, ?, 0, NULL, ?)`;

// UNIQUE `lich_hen_id` ⇒ truy cập `const`
export const READ_RATING_SQL = `SELECT so_sao AS soSao, nhan_xet AS nhanXet, thoi_diem_tao AS thoiDiemTao
FROM danh_gia_bac_si WHERE lich_hen_id = ?`;

/** Lịch mã `maLichHen` (đã chuẩn hoá chữ hoa) của Bệnh nhân `patientId` (từ access token) ở MỌI trạng thái, hoặc `null`: lịch của người khác và lịch không có cho cùng kết quả. */
export async function readOwnedForRating(
  db: Pick<DataSource | EntityManager, 'query'>,
  patientId: string,
  maLichHen: string,
): Promise<OwnedForRating | null> {
  const rows = await db.query<OwnedForRating[]>(READ_OWNED_FOR_RATING_SQL, [
    patientId,
    maLichHen,
  ]);
  return rows[0] ?? null;
}

/** Ghi MỘT đánh giá: `lichHenId` luôn là của lịch đã đọc ở trên (không từ thân), `now` đã cắt giây (`toSecond`). 1062 (UNIQUE) để nơi gọi bắt. */
export async function insertRating(
  em: EntityManager,
  lichHenId: string,
  rating: ValidRating,
  now: Date,
): Promise<void> {
  await em.query(INSERT_RATING_SQL, [
    lichHenId,
    rating.soSao,
    rating.nhanXet,
    now,
  ]);
}

interface RatingRow {
  soSao: number | string;
  nhanXet: string | null;
  thoiDiemTao: Date;
}

/** Đánh giá của lịch như ĐÃ LƯU, đúng hình dạng 201 (cùng ba khoá với `danhGia` của B5), hoặc `null`. */
export async function readRating(
  em: EntityManager,
  lichHenId: string,
): Promise<RatingView | null> {
  const rows = await em.query<RatingRow[]>(READ_RATING_SQL, [lichHenId]);
  const row = rows[0];
  if (row === undefined) return null;
  return {
    soSao: Number(row.soSao),
    nhanXet: row.nhanXet,
    thoiDiemTao: row.thoiDiemTao.toISOString(),
  };
}
