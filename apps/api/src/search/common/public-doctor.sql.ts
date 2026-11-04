/**
 * MỘT chỗ định nghĩa "bác sĩ công khai" (PLAN search 5.3, H5). Mọi truy vấn danh sách, chi tiết, đếm (`soBacSi`, con số trang chủ,
 * `giaKhamTu`) đều nhúng đúng hằng này để các nơi không thể lệch nhau.
 *
 * Quy ước alias bắt buộc trong truy vấn dùng hằng này:
 *   b = bac_si, t = tai_khoan (b.tai_khoan_id = t.tai_khoan_id), ck = chuyen_khoa (b.chuyen_khoa_id = ck.chuyen_khoa_id).
 *
 * Nội dung theo Q13: tài khoản bác sĩ đang hoạt động (ẩn ChoKichHoat/NgungHoatDong), chuyên khoa đang hoạt động,
 * cặp chi nhánh–dịch vụ của bác sĩ còn trong chi_nhanh_dich_vu_kham. Bác sĩ chưa có lịch vẫn hiện.
 * Không có tham số `?` nên nối thẳng vào mệnh đề WHERE là an toàn.
 */
export const PUBLIC_DOCTOR_CONDITION = `(
  t.loai_tai_khoan = 'BacSi'
  AND t.trang_thai = 'DangHoatDong'
  AND ck.trang_thai_hoat_dong = 'DangHoatDong'
  AND EXISTS (
    SELECT 1 FROM chi_nhanh_dich_vu_kham cndv
    WHERE cndv.chi_nhanh_id = b.chi_nhanh_id
      AND cndv.dich_vu_kham_id = b.dich_vu_kham_id
  )
)`;

/** Phần FROM + JOIN chuẩn đi kèm hằng trên, để truy vấn không phải tự lặp lại alias. */
export const PUBLIC_DOCTOR_FROM = `bac_si b
  JOIN tai_khoan t ON t.tai_khoan_id = b.tai_khoan_id
  JOIN chuyen_khoa ck ON ck.chuyen_khoa_id = b.chuyen_khoa_id`;
