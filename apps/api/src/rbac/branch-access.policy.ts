import { AppException } from '../common/errors/app.exception.js';
import type { AdminScope } from './admin-scope.js';

// Policy không đọc DB/request. Caller phải lấy chi nhánh tài nguyên từ DB,
// và kiểm sau khóa dòng trong cùng transaction khi chuẩn bị sửa tài nguyên.
export class BranchAccessPolicy {
  assertToanHeThong(scope: AdminScope): void {
    if (scope.kind !== 'ToanHeThong')
      throw new AppException(403, 'KHONG_DU_QUYEN');
  }

  canAccessBranch(scope: AdminScope, branchId: string): boolean {
    return scope.kind === 'ToanHeThong' || scope.chiNhanhId === branchId;
  }

  assertCanSee(scope: AdminScope, branchId: string): void {
    if (!this.canAccessBranch(scope, branchId))
      throw new AppException(404, 'KHONG_TIM_THAY');
  }

  assertCanAct(scope: AdminScope, branchId: string, allowed: boolean): void {
    this.assertCanSee(scope, branchId);
    if (!allowed) throw new AppException(403, 'KHONG_DU_QUYEN');
  }

  branchFilter(scope: AdminScope, requested?: string): string | undefined {
    return scope.kind === 'ChiNhanh' ? scope.chiNhanhId : requested;
  }

  // Alias do repository chọn, không nhận từ request. Giá trị luôn bind tham số.
  // Caller áp dụng cùng predicate cho SELECT và COUNT, trước phân trang.
  patientVisibilityFilter(scope: AdminScope, patientAlias = 'patient') {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(patientAlias))
      throw new Error('Alias SQL không hợp lệ');
    return scope.kind === 'ToanHeThong'
      ? { sql: '1 = 1', parameters: {} }
      : {
          sql: `EXISTS (SELECT 1 FROM lich_hen rbac_lh WHERE rbac_lh.benh_nhan_id = ${patientAlias}.tai_khoan_id AND rbac_lh.chi_nhanh_id = :rbacBranchId)`,
          parameters: { rbacBranchId: scope.chiNhanhId },
        };
  }
}
