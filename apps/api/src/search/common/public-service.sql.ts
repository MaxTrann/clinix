/**
 * MỘT chỗ định nghĩa "dịch vụ khám đang cung cấp" (PLAN search 5.3, Q10): dịch vụ có trong `chi_nhanh_dich_vu_kham` —
 * của chi nhánh đang lọc, hoặc của ít nhất một chi nhánh khi không lọc. Danh sách nhóm, danh sách dịch vụ và (về sau)
 * con số trang chủ đều nhúng đúng hằng này để không lệch nhau (H5).
 *
 * Quy ước alias: `d` = dich_vu_kham. Khi `branchFilter = true` câu SQL có đúng MỘT dấu `?` cho `chi_nhanh_id`.
 */
export function publicServiceCondition(branchFilter: boolean): string {
  return `EXISTS (
    SELECT 1 FROM chi_nhanh_dich_vu_kham cndv_pub
    WHERE cndv_pub.dich_vu_kham_id = d.dich_vu_kham_id
      ${branchFilter ? 'AND cndv_pub.chi_nhanh_id = ?' : ''}
  )`;
}
