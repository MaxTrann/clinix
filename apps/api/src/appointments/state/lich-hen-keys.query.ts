import type { EntityManager } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';

// Đọc THƯỜNG (không khoá) các cột BẤT BIẾN của một lịch hẹn để biết phải khoá gì trước (PLAN booking 5.3 quy tắc 1: `khung_gio_id` không đổi sau khi chèn, lịch huỷ hay đổi vẫn giữ nó).
// Luồng chỉ biết `lich_hen_id` (hết hạn, huỷ, xác nhận…) gọi hàm này rồi khoá `khung_gio` (tầng 5), rồi khoá `lich_hen` THEO KHOÁ CHÍNH (tầng 6) và kiểm lại mọi điều kiện dưới khoá.
// Hàm CHUNG của `AppointmentTransitionService`: B9 (`expire`) cần `khungGioId`; B12 (`markNoShow`) thêm `benhNhanId` và `chiNhanhId` vào ĐÚNG hàm này thay vì viết câu đọc riêng.
// Chỉ ĐỌC: không có mệnh đề khoá, nên AR-05 và AR-06 không bắt.

// `benhNhanId` (tài khoản ĐẶT, nhận thông báo; tầng 2 của `markNoShow`) và `chiNhanhId` (phạm vi của Lễ tân, Quản trị viên) thêm ở B12: cả hai cũng bất biến sau khi chèn (5.3 quy tắc 1).
export interface LichHenKeys {
  khungGioId: string;
  benhNhanId: string;
  chiNhanhId: string;
}

// `CAST … AS CHAR`: id là `bigint`, driver có thể trả số hoặc chuỗi; luôn lấy chuỗi để so sánh và truyền đi không mất chính xác.
const READ_KEYS_SQL = `SELECT CAST(khung_gio_id AS CHAR) AS khungGioId, CAST(benh_nhan_id AS CHAR) AS benhNhanId, CAST(chi_nhanh_id AS CHAR) AS chiNhanhId
FROM lich_hen WHERE lich_hen_id = ?`;

/** Khoá bất biến của lịch, hoặc `null` nếu không có lịch đó. */
export async function readLichHenKeys(
  em: EntityManager,
  lichHenId: string,
): Promise<LichHenKeys | null> {
  const rows = await em.query<LichHenKeys[]>(READ_KEYS_SQL, [lichHenId]);
  return rows[0] ?? null;
}

// Cho luồng chỉ biết MÃ lịch hẹn (huỷ, B10; B11, B12 tiếp theo): tra theo `ma_lich_hen` (UNIQUE; collation không phân biệt hoa thường, người gọi đã chuẩn hoá chữ hoa) rồi trả đủ khoá để khoá `khung_gio`
// trước, kiểm phạm vi và sở hữu. `benhNhanId` và `chiNhanhId` bất biến sau khi chèn (5.3 quy tắc 1); `trangThai` thì KHÔNG: chỉ để kiểm phạm vi lần đầu (Bệnh nhân không thấy `DaDoiLich`),
// quyết định thật đọc LẠI dưới khoá. Chỉ ĐỌC, không khoá.
export interface LichHenOwnerKeys {
  lichHenId: string;
  maLichHen: string;
  khungGioId: string;
  benhNhanId: string;
  chiNhanhId: string;
  trangThai: TrangThaiLichHen;
}

const READ_KEYS_BY_CODE_SQL = `SELECT CAST(lich_hen_id AS CHAR) AS lichHenId, ma_lich_hen AS maLichHen, CAST(khung_gio_id AS CHAR) AS khungGioId,
  CAST(benh_nhan_id AS CHAR) AS benhNhanId, CAST(chi_nhanh_id AS CHAR) AS chiNhanhId, trang_thai AS trangThai
FROM lich_hen WHERE ma_lich_hen = ?`;

/** Khoá của lịch theo mã, hoặc `null` nếu không có lịch đó. */
export async function readLichHenKeysByCode(
  em: EntityManager,
  maLichHen: string,
): Promise<LichHenOwnerKeys | null> {
  const rows = await em.query<LichHenOwnerKeys[]>(READ_KEYS_BY_CODE_SQL, [
    maLichHen,
  ]);
  return rows[0] ?? null;
}
