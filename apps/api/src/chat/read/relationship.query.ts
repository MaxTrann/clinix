// Trạng thái quan hệ "Đã từng khám / Chưa từng khám" của hội thoại bác sĩ (chat B2; 2.4.20 b3, 2.4.29 b3; Q16, MH3).
// Tính ĐỘNG từ `lich_hen` mỗi lần đọc (không lưu cột nào). Q16: tính cả "Đã tiếp đón" (chữ 2.4 chỉ ghi Đã xác nhận/Hoàn thành; `[ĐỒNG BỘ TL]` do Đại sửa Word).
// Lọc theo `benh_nhan_id` là TÀI KHOẢN chủ lịch nên lịch của hồ sơ người thân (cùng `benh_nhan_id`, có `ho_so_nguoi_than_id`) cũng được tính (MH3, NBS-06).
// Không tính `ChoThanhToan`, `DaHuy`, `DaDoiLich`, `VangMat` (NBS-05). Câu dùng chỉ mục `lich_hen_index_9 (benh_nhan_id, trang_thai, thoi_gian)`.

/** Ba trạng thái lịch được tính là "đã từng khám" (Q16). Test đối chiếu danh sách này với câu SQL bên dưới để hai chỗ không lệch nhau. */
export const VISITED_STATUSES = [
  'DaXacNhan',
  'DaTiepDon',
  'HoanThanh',
] as const;

/**
 * Đoạn SQL CỐ ĐỊNH, dùng bên trong câu đọc đầu hội thoại: `h` là `hoi_thoai`, `dm` là dòng thành viên bác sĩ của hội thoại đó.
 * Hộp thư chung không có `dm` nên kết quả là 0 (nơi đọc trả `quanHe: null` cho loại này).
 */
export const HAS_VISITED_EXISTS = `EXISTS (SELECT 1 FROM lich_hen l
     WHERE l.benh_nhan_id = h.nguoi_tao_id AND l.bac_si_id = dm.tai_khoan_id
       AND l.trang_thai IN ('DaXacNhan', 'DaTiepDon', 'HoanThanh'))`;
