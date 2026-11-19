import type { AuditEntry } from '../../audit/audit-entry.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import type { ChucDanhBacSi, HocViBacSi } from '../entities/enums.js';
import type { StaffAccountInput, StaffRole } from './staff-account.types.js';

// Quy tắc của task B15 dưới dạng HÀM THUẦN (không DB, không đồng hồ): kiểm riêng được và là nơi DUY NHẤT định nghĩa các quy tắc này.

/**
 * Học vị tương thích với từng chức danh (CHECK `chk_bac_si_chuc_danh_hoc_vi`, Q20): 7 cặp hợp lệ trong 35 tổ hợp.
 * BS, BS_CKI, BS_CKII cùng đi với học vị BS (BS_CKI và BS_CKII là `[đề xuất]` của schema, nhóm chưa chốt: xem `docs/database`).
 * Bảng này PHẢI trùng CHECK của DB; test tích hợp NSB15-37 chèn thô cả 35 cặp để bảo đảm.
 */
export const DEGREE_OF_TITLE: Readonly<Record<ChucDanhBacSi, HocViBacSi>> = {
  BS: 'BS',
  BS_CKI: 'BS',
  BS_CKII: 'BS',
  ThS_BS: 'ThS',
  TS_BS: 'TS',
  PGS_TS_BS: 'PGS',
  GS_TS_BS: 'GS',
};

export function isCompatibleTitleDegree(
  chucDanh: ChucDanhBacSi,
  hocVi: HocViBacSi,
): boolean {
  return DEGREE_OF_TITLE[chucDanh] === hocVi;
}

/** Số năm kinh nghiệm nhập được (Q20): số nguyên 0 đến 60; DB chỉ chặn `>= 0`, cận trên là quy tắc ứng dụng. */
export const MAX_EXPERIENCE_YEARS = 60;

export function isValidExperienceYears(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_EXPERIENCE_YEARS
  );
}

/**
 * Ma trận quyền theo vai trò được tạo (PLAN NS A2, NS-05, 07, 08): Toàn hệ thống tạo cả ba vai trò; Quản trị viên Chi nhánh chỉ tạo Bác sĩ và Lễ tân
 * (chi nhánh của họ kiểm riêng bằng `BranchAccessPolicy`), còn tạo Quản trị viên là "không đủ quyền".
 */
export function canCreateRole(scope: AdminScope, role: StaffRole): boolean {
  return role !== 'QuanTriVien' || scope.kind === 'ToanHeThong';
}

/** Chi nhánh của nhân sự mới: Quản trị viên Toàn hệ thống không thuộc chi nhánh nào (`null`), mọi trường hợp khác có đúng một chi nhánh. */
export function branchIdOf(input: StaffAccountInput): string | null {
  return input.vaiTro === 'QuanTriVien' && input.phamVi === 'ToanHeThong'
    ? null
    : input.chiNhanhId;
}

/**
 * Dòng audit `TaoTaiKhoanNhanSu` (PLAN 5.10, NS-24): chỉ loại tài khoản, chi nhánh và (với Quản trị viên) phạm vi. KHÔNG bao giờ copy DTO vào đây:
 * họ tên, email, SĐT, mật khẩu, token, băm đều không được ghi. `validateAuditEntry` đòi `chi_nhanh_id` bằng `branchId` và `pham_vi` khớp `branchId`.
 */
export function buildCreateAudit(
  actorId: string,
  taiKhoanId: string,
  input: StaffAccountInput,
): AuditEntry {
  const branchId = branchIdOf(input);
  return {
    actorId,
    branchId,
    action: 'TaoTaiKhoanNhanSu',
    targetType: 'tai_khoan',
    targetId: taiKhoanId,
    result: 'ThanhCong',
    changes:
      input.vaiTro === 'QuanTriVien'
        ? {
            loai_tai_khoan: 'QuanTriVien',
            chi_nhanh_id: branchId,
            pham_vi: input.phamVi,
          }
        : { loai_tai_khoan: input.vaiTro, chi_nhanh_id: branchId },
  };
}
