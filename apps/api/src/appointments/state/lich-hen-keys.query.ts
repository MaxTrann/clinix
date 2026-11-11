import type { EntityManager } from 'typeorm';

// Đọc THƯỜNG (không khoá) các cột BẤT BIẾN của một lịch hẹn để biết phải khoá gì trước (PLAN booking 5.3 quy tắc 1: `khung_gio_id` không đổi sau khi chèn, lịch huỷ hay đổi vẫn giữ nó).
// Luồng chỉ biết `lich_hen_id` (hết hạn, huỷ, xác nhận…) gọi hàm này rồi khoá `khung_gio` (tầng 5), rồi khoá `lich_hen` THEO KHOÁ CHÍNH (tầng 6) và kiểm lại mọi điều kiện dưới khoá.
// Hàm CHUNG của `AppointmentTransitionService`: B9 (`expire`) cần `khungGioId`; B10, B11 thêm cột bất biến khác (`benhNhanId`, tra theo `ma_lich_hen`) vào ĐÚNG hàm này thay vì viết câu đọc riêng.
// Chỉ ĐỌC: không có mệnh đề khoá, nên AR-05 và AR-06 không bắt.

export interface LichHenKeys {
  khungGioId: string;
}

// `CAST … AS CHAR`: id là `bigint`, driver có thể trả số hoặc chuỗi; luôn lấy chuỗi để so sánh và truyền đi không mất chính xác.
const READ_KEYS_SQL = `SELECT CAST(khung_gio_id AS CHAR) AS khungGioId
FROM lich_hen WHERE lich_hen_id = ?`;

/** Khoá bất biến của lịch, hoặc `null` nếu không có lịch đó. */
export async function readLichHenKeys(
  em: EntityManager,
  lichHenId: string,
): Promise<LichHenKeys | null> {
  const rows = await em.query<LichHenKeys[]>(READ_KEYS_SQL, [lichHenId]);
  return rows[0] ?? null;
}
