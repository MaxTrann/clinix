import type { EntityManager } from 'typeorm';
import { toSecond } from '../common/time/time.js';
import { ACTIVE_APPOINTMENT_STATES } from './active-appointment-states.js';

/** Một lịch hẹn đang hoạt động chồng khoảng thời gian: danh sách trắng (PLAN 5.14: `chiTiet` chỉ có mã và giờ), không có `lich_hen_id`, giá hay lý do khám. */
export interface OverlappingAppointment {
  maLichHen: string;
  /** ISO 8601 UTC (`Date.toISOString()`), nơi hiển thị tự đổi sang giờ Việt Nam */
  thoiGian: string;
}

interface OverlappingRow {
  maLichHen: string;
  thoiGian: Date;
}

// Chồng lấn (Q10): cùng HỒ SƠ ĐI KHÁM `(benh_nhan_id, ho_so_nguoi_than_id)` (`<=>`: NULL là hồ sơ bản thân, nên hai hồ sơ khác nhau của cùng tài khoản không chồng nhau) có lịch ĐANG HOẠT
// ĐỘNG (cùng `ACTIVE_APPOINTMENT_STATES` với `findActiveAppointments`, không viết lại tập trạng thái) mà `[thoi_gian, thoi_gian + thoi_luong)` giao `[batDau, batDau + thoiLuongPhut)`.
// Nửa mở: lịch kia kết thúc đúng lúc khung giờ mới bắt đầu thì KHÔNG chồng. `dich_vu_kham.thoi_luong` là giá trị HIỆN HÀNH, vì `lich_hen` không lưu thời lượng (PLAN 5.4 bước 3).
// Điều kiện đầu `lh.thoi_gian < DATE_ADD(?, …)` dùng cột trần nên dùng được chỉ mục `(benh_nhan_id, trang_thai, thoi_gian)`; điều kiện sau bọc cột bằng `DATE_ADD(lh.thoi_gian, …)` (cần
// cộng thời lượng của từng dịch vụ) nên điều kiện đó không dùng được chỉ mục, nhưng đúng là câu đã đo ở X1 M11 (khoảng 1 ms). Sắp theo giờ rồi `lich_hen_id` để kết quả ổn định.
const FIND_OVERLAPPING_SQL = `SELECT lh.ma_lich_hen AS maLichHen, lh.thoi_gian AS thoiGian
FROM lich_hen lh
JOIN dich_vu_kham d ON d.dich_vu_kham_id = lh.dich_vu_kham_id
WHERE lh.benh_nhan_id = ? AND lh.ho_so_nguoi_than_id <=> ?
  AND lh.trang_thai IN (${ACTIVE_APPOINTMENT_STATES.map(() => '?').join(', ')})
  AND lh.thoi_gian < DATE_ADD(?, INTERVAL ? MINUTE)
  AND DATE_ADD(lh.thoi_gian, INTERVAL d.thoi_luong MINUTE) > ?
ORDER BY lh.thoi_gian ASC, lh.lich_hen_id ASC`;

/**
 * Mọi lịch đang hoạt động của một hồ sơ đi khám chồng khoảng `[batDau, batDau + thoiLuongPhut)`; mảng rỗng nếu không có. Trả DANH SÁCH (không chỉ lịch đầu) để luật `evaluateBookability`
 * tự loại lịch chủ đã hết hạn của chính khung giờ đang đặt (hết hạn lười, TRACKING 3.14 câu (i)) mà vẫn tính các lịch khác.
 * Câu ĐỌC THƯỜNG, nhận `em` của người gọi; người gọi đã giữ khoá trước đó (không đọc trước hai câu khoá `benh_nhan`, `ho_so_nguoi_than`: hợp đồng patient 5.3).
 */
export async function findOverlappingAppointments(
  em: EntityManager,
  input: {
    benhNhanId: string;
    hoSoNguoiThanId: string | null;
    batDau: Date;
    thoiLuongPhut: number;
  },
): Promise<OverlappingAppointment[]> {
  // `toSecond`: mọi `Date` đưa vào so sánh với cột `datetime` phải cắt xuống giây (X1 M4)
  const start = toSecond(input.batDau);
  const rows = await em.query<OverlappingRow[]>(FIND_OVERLAPPING_SQL, [
    input.benhNhanId,
    input.hoSoNguoiThanId,
    ...ACTIVE_APPOINTMENT_STATES,
    start,
    input.thoiLuongPhut,
    start,
  ]);
  return rows.map((row) => ({
    maLichHen: row.maLichHen,
    thoiGian: row.thoiGian.toISOString(),
  }));
}
