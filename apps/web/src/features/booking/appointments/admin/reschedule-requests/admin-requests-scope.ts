import { createContext, useContext } from 'react';

// Phạm vi chi nhánh của trang yêu cầu đổi lịch phía Quản trị viên (reschedule F5). `AdminRescheduleRequestsLayout` cấp giá trị; trang danh sách và bộ chọn đọc. Giữ ở layout (không URL, không kho trình duyệt) nên
// sống qua việc mở chi tiết rồi quay lại, mất khi tải lại trang (giới hạn đã biết). Tách khỏi file thành phần vì luật `react-refresh/only-export-components`.
export interface AdminRequestsScope {
  // Chỉ Quản trị viên Toàn hệ thống được chọn chi nhánh
  allowBranch: boolean;
  // Tên chi nhánh được gán (Quản trị viên Chi nhánh); `null` khi Toàn hệ thống
  branchName: string | null;
  // Id chi nhánh đang lọc, '' = tất cả; luôn '' khi không được chọn
  branch: string;
  setBranch: (value: string) => void;
}

export const AdminRequestsScopeContext =
  createContext<AdminRequestsScope | null>(null);

export function useAdminRequestsScope(): AdminRequestsScope {
  const scope = useContext(AdminRequestsScopeContext);
  if (scope === null) {
    throw new Error(
      'Trang yêu cầu đổi lịch của Quản trị viên phải nằm trong layout của nó',
    );
  }
  return scope;
}
