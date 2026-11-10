import type { AdminScope } from './admin-scope.js';

// Lễ tân luôn thuộc đúng MỘT chi nhánh (`le_tan.chi_nhanh_id` NOT NULL), nên phạm vi của họ chính là biến thể
// `ChiNhanh` của AdminScope: đưa thẳng vào BranchAccessPolicy (`canAccessBranch`, `assertCanSee`, `branchFilter`)
// mà không cần hàm chuyển đổi và không phải sửa AdminScope hay BranchAccessPolicy (booking P4, Q34).
//
// CẢNH BÁO: KHÔNG đưa vào `BranchAccessPolicy.patientVisibilityFilter`. Hàm đó lọc "bệnh nhân có lịch hẹn tại chi nhánh"
// cho Quản trị viên Chi nhánh; Lễ tân tra cứu Bệnh nhân TOÀN HỆ THỐNG (patient Q16, `GET /reception/patients`).
export type ReceptionScope = Extract<AdminScope, { kind: 'ChiNhanh' }>;
