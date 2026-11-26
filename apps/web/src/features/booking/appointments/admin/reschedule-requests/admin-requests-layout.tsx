import { useState } from 'react';
import { Outlet } from 'react-router';
import { useAdminScope } from '../../../../admin';
import { AdminRequestsScopeContext } from './admin-requests-scope';

// Layout của route con "Yêu cầu đổi lịch" trong trang "Duyệt yêu cầu" (reschedule F5): nằm TRÊN cả danh sách lẫn chi tiết nên chi nhánh đã chọn còn nguyên khi mở một yêu cầu rồi quay lại. Phạm vi lấy từ
// `useAdminScope()` (đã tải ở `AdminLayout`): chỉ Toàn hệ thống có ô chọn; Chi nhánh luôn gửi chuỗi rỗng (không tham số chi nhánh) và chỉ thấy tên chi nhánh được gán.
export function AdminRescheduleRequestsLayout() {
  const adminScope = useAdminScope();
  const [selected, setSelected] = useState('');
  const allowBranch = adminScope.phamVi === 'ToanHeThong';

  return (
    <AdminRequestsScopeContext.Provider
      value={{
        allowBranch,
        branchName:
          adminScope.phamVi === 'ChiNhanh' ? adminScope.chiNhanh.ten : null,
        branch: allowBranch ? selected : '',
        setBranch: setSelected,
      }}
    >
      <Outlet />
    </AdminRequestsScopeContext.Provider>
  );
}
