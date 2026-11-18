import type { AdminScope } from '../../rbac/admin-scope.js';
import type { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';

// Điều kiện SQL kèm tham số có tên (`:tên`), dùng với alias của ACCOUNT_FROM_SQL.
export interface SqlCondition {
  sql: string;
  parameters: Record<string, unknown>;
}

// Đoạn FROM DÙNG CHUNG cho mọi truy vấn tài khoản của admin (B17 đọc; B18, B19, B20 cũng dùng cho truy vấn khoá hàng của họ),
// để phạm vi tầm nhìn chỉ được tính ở MỘT nơi. Alias cố định: t = tai_khoan, bn = benh_nhan, bs = bac_si, le = le_tan,
// qv = quan_tri_vien, cn = chi_nhanh. Mỗi bảng con có khoá chính = tai_khoan_id (1–1) nên JOIN không nhân dòng.
// Chi nhánh của một tài khoản lấy theo LOẠI tài khoản; Bệnh nhân không có chi nhánh riêng.
export const ACCOUNT_FROM_SQL = `
  tai_khoan t
  LEFT JOIN benh_nhan bn ON bn.tai_khoan_id = t.tai_khoan_id
  LEFT JOIN bac_si bs ON bs.tai_khoan_id = t.tai_khoan_id
  LEFT JOIN le_tan le ON le.tai_khoan_id = t.tai_khoan_id
  LEFT JOIN quan_tri_vien qv ON qv.tai_khoan_id = t.tai_khoan_id
  LEFT JOIN chi_nhanh cn ON cn.chi_nhanh_id = CASE t.loai_tai_khoan
    WHEN 'BacSi' THEN bs.chi_nhanh_id
    WHEN 'LeTan' THEN le.chi_nhanh_id
    WHEN 'QuanTriVien' THEN qv.chi_nhanh_id
  END`;

/**
 * Điều kiện "người gọi được thấy tài khoản nào" (PLAN 5.6, Q26, Q27, Q40). Phạm vi lấy từ `scope` do guard tính từ DB,
 * KHÔNG từ client; `requestedBranchId` là bộ lọc `chiNhanhId` (chỉ có tác dụng với Toàn hệ thống: C1 bỏ qua nó với Chi nhánh).
 *
 *  - Toàn hệ thống, không lọc chi nhánh: thấy tất cả.
 *  - Có chi nhánh b (Chi nhánh: luôn là chi nhánh của mình): Bác sĩ và Lễ tân của b, và Bệnh nhân có ít nhất một lịch hẹn
 *    (mọi trạng thái) tại b (EXISTS của C1, nên một Bệnh nhân nhiều lịch vẫn là MỘT dòng). Chỉ khi người gọi là Toàn hệ thống
 *    mới thêm Quản trị viên của b: Admin Chi nhánh không bao giờ thấy Quản trị viên nào, kể cả chính mình (Q27).
 *  - Hồ sơ con thiếu (dữ liệu hỏng): cột chi nhánh là NULL nên không khớp, Chi nhánh không thấy (đóng mặc định).
 */
export function accountVisibility(
  policy: BranchAccessPolicy,
  scope: AdminScope,
  requestedBranchId?: string,
): SqlCondition {
  const branchId = policy.branchFilter(scope, requestedBranchId);
  if (branchId === undefined) return { sql: '1 = 1', parameters: {} };

  // "Xem như Admin của chi nhánh b": dùng lại đúng điều kiện Bệnh nhân của C1.
  const patients = policy.patientVisibilityFilter(
    { kind: 'ChiNhanh', chiNhanhId: branchId },
    't',
  );
  const branches = [
    "(t.loai_tai_khoan = 'BacSi' AND bs.chi_nhanh_id = :accountBranchId)",
    "(t.loai_tai_khoan = 'LeTan' AND le.chi_nhanh_id = :accountBranchId)",
    `(t.loai_tai_khoan = 'BenhNhan' AND ${patients.sql})`,
  ];
  if (scope.kind === 'ToanHeThong') {
    branches.push(
      "(t.loai_tai_khoan = 'QuanTriVien' AND qv.chi_nhanh_id = :accountBranchId)",
    );
  }
  return {
    sql: `(${branches.join(' OR ')})`,
    parameters: { accountBranchId: branchId, ...patients.parameters },
  };
}
