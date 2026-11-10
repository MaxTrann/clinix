// Vị từ "bác sĩ thuộc phạm vi chi nhánh" (PLAN doctor Q14, 5.6): MỘT chỗ duy nhất cho Admin Chi nhánh (B9) và Lễ tân (B8).
// Bác sĩ thuộc chi nhánh khi hồ sơ đang công tác ở đó, HOẶC từng có ca mang chi nhánh đó (kể cả ca đã qua, để còn xem lịch cũ
// sau khi bác sĩ chuyển chi nhánh).

export interface SqlPredicate {
  sql: string;
  /** Tham số vị trí `?`, theo đúng thứ tự xuất hiện trong `sql`. */
  parameters: string[];
}

// Dạng `IN (subquery)` theo khuyến nghị đo M11 (X1, TRACKING mục 6): dùng chỉ mục `lich_lam_viec_index_4 (chi_nhanh_id, ngay)`, ~10–12 ms trên
// 100.000 ca, nhanh gấp ~7 lần dạng `OR EXISTS` (~71–77 ms) vì không phải đọc ~250 ca của MỖI bác sĩ. Cùng ngữ nghĩa Q14.

/**
 * `chiNhanhId` không có (Admin Toàn hệ thống không lọc) ⇒ không giới hạn. Giá trị luôn bind tham số.
 * `alias` là bí danh bảng `bac_si` do repository chọn (không nhận từ request) nên chỉ cho phép định danh an toàn.
 */
export function doctorScopePredicate(
  chiNhanhId: string | undefined,
  alias = 'b',
): SqlPredicate {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias))
    throw new Error('Alias SQL không hợp lệ');
  if (chiNhanhId === undefined) return { sql: '1 = 1', parameters: [] };
  return {
    sql: `(${alias}.chi_nhanh_id = ? OR ${alias}.tai_khoan_id IN (SELECT scope_lv.bac_si_id FROM lich_lam_viec scope_lv WHERE scope_lv.chi_nhanh_id = ?))`,
    parameters: [chiNhanhId, chiNhanhId],
  };
}
