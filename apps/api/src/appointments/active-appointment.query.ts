import type { EntityManager } from 'typeorm';
import {
  ACTIVE_APPOINTMENT_STATES,
  type ActiveAppointmentState,
} from './active-appointment-states.js';

/**
 * Một lịch hẹn đang hoạt động của một hồ sơ đi khám, đúng năm khoá này (danh sách trắng, PLAN patient Q11):
 *  - `thoiGian`: chuỗi ISO 8601 UTC (`Date.toISOString()`), nơi hiển thị tự đổi sang giờ Việt Nam;
 *  - `bacSi`, `chiNhanh`: chuỗi TÊN (tên tài khoản bác sĩ; tên chi nhánh theo `lich_hen.chi_nhanh_id` là snapshot lúc đặt).
 * Không có `lich_hen_id`, `benh_nhan_id`, giá hay lý do khám.
 */
export interface ActiveAppointment {
  maLichHen: string;
  thoiGian: string;
  trangThai: ActiveAppointmentState;
  bacSi: string;
  chiNhanh: string;
}

// Hàng thô của câu SELECT: `thoi_gian` (DATETIME) ra `Date` nhờ múi giờ của driver (`DB_TIMEZONE`), nên ISO không phụ thuộc múi giờ tiến trình.
interface ActiveAppointmentRow {
  maLichHen: string;
  thoiGian: Date;
  trangThai: ActiveAppointmentState;
  bacSi: string;
  chiNhanh: string;
}

// Tham số `IN (…)` sinh từ `ACTIVE_APPOINTMENT_STATES`, không viết lại tập trạng thái ở đây.
// `ho_so_nguoi_than_id <=> ?` (so sánh an toàn với NULL, quy tắc 37): `null` là hồ sơ BẢN THÂN; id thật chỉ khớp lịch của đúng hồ sơ người thân đó.
// Sắp theo thời gian tăng dần, cùng giờ thì theo `lich_hen_id`. Trình tối ưu tự chọn chỉ mục (đã đo, TRACKING patient B5-D mục 8).
const FIND_ACTIVE_APPOINTMENTS_SQL = `SELECT lh.ma_lich_hen AS maLichHen, lh.thoi_gian AS thoiGian, lh.trang_thai AS trangThai,
  tk.ho_ten AS bacSi, cn.ten AS chiNhanh
FROM lich_hen lh
JOIN bac_si bs ON bs.tai_khoan_id = lh.bac_si_id
JOIN tai_khoan tk ON tk.tai_khoan_id = bs.tai_khoan_id
JOIN chi_nhanh cn ON cn.chi_nhanh_id = lh.chi_nhanh_id
WHERE lh.ho_so_nguoi_than_id <=> ? AND lh.benh_nhan_id = ?
  AND lh.trang_thai IN (${ACTIVE_APPOINTMENT_STATES.map(() => '?').join(', ')})
ORDER BY lh.thoi_gian ASC, lh.lich_hen_id ASC`;

/**
 * Lịch hẹn đang hoạt động của MỘT hồ sơ đi khám `(benhNhanId, hoSoNguoiThanId)`; `hoSoNguoiThanId = null` là hồ sơ bản thân. Trả mảng rỗng nếu không có.
 * Nhận `em` của NGƯỜI GỌI để chạy trong giao dịch của họ (`booking` sẽ gọi trong giao dịch đặt lịch).
 * Đây là câu ĐỌC THƯỜNG (không khoá). Người gọi chịu trách nhiệm đã giữ khoá trước đó (ngừng hồ sơ: `benh_nhan` rồi `ho_so_nguoi_than`) và
 * KHÔNG được gọi hàm này trước hai câu khoá: dưới REPEATABLE READ, câu đọc thường đầu tiên của giao dịch chốt ảnh chụp (PLAN patient 5.3).
 */
export async function findActiveAppointments(
  em: EntityManager,
  benhNhanId: string,
  hoSoNguoiThanId: string | null,
): Promise<ActiveAppointment[]> {
  const rows = await em.query<ActiveAppointmentRow[]>(
    FIND_ACTIVE_APPOINTMENTS_SQL,
    [hoSoNguoiThanId, benhNhanId, ...ACTIVE_APPOINTMENT_STATES],
  );
  // Chọn từng khoá một (không trải nguyên hàng) để cột thừa không bao giờ lọt ra ngoài
  return rows.map((row) => ({
    maLichHen: row.maLichHen,
    thoiGian: row.thoiGian.toISOString(),
    trangThai: row.trangThai,
    bacSi: row.bacSi,
    chiNhanh: row.chiNhanh,
  }));
}
