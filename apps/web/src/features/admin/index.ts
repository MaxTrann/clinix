export { AdminConfirmationDialog } from './components/admin-confirmation-dialog';
export { AdminDetailPanel } from './components/admin-detail-panel';
export { AdminSearchInput } from './components/admin-search-input';
export { AdminTable } from './components/admin-table';
export type { AdminTableColumn } from './components/admin-table';
export type { AdminMe } from './admin-me';
// doctor F6 (Q36): module doctor bọc route Admin bằng AdminScopeGuard và đọc phạm vi bằng useAdminScope, chỉ qua index này
export { AdminScopeGuard } from './admin-scope-guard';
export { useAdminScope } from './use-admin-scope';
// dashboard F1: trang Tổng quan hiện trang "không đủ quyền" của khu Admin khi API trả 403
export { AdminForbiddenPage } from './admin-forbidden-page';
// article F1 (T22): biểu mẫu bài viết đưa focus vào ô lỗi đầu tiên bằng hook này, chỉ qua index này
export { useFocusFirstInvalid } from './hooks/use-focus-first-invalid';
