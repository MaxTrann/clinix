// Chữ riêng của Quản trị viên trên trang yêu cầu đổi lịch (reschedule F5; `[đề xuất]`, nhóm sửa khi duyệt PR, Q13). Chữ còn lại dùng chung `REQUEST_TEXT` của thành phần dùng chung.
export const ADMIN_REQUEST_TEXT = {
  branchLabel: 'Chi nhánh',
  branchWhat: 'chi nhánh',
  selectedBranch: 'Chi nhánh đã chọn',
  assignedBranch: (name: string) => `Chi nhánh: ${name}`,
} as const;
