import { useState } from 'react';
import { useAdminScope } from '../use-admin-scope';
import { BranchPage } from './branch-page';
import { ChangeRequestsPanel } from './change-requests/change-requests-panel';

// Tab "Chi nhánh" của màn Thông tin phòng khám (admin F6b; Figma 542:2, 693:2): khối yêu cầu thay đổi ở trên, danh sách chi nhánh ở dưới.
// Hai khối làm mới lẫn nhau: Sửa lịch tạo yêu cầu mới ⇒ khối yêu cầu tải lại; Duyệt hay Từ chối ⇒ danh sách chi nhánh tải lại (nhãn "có yêu cầu").
export function BranchesTab() {
  const adminScope = useAdminScope();
  const [requestsKey, setRequestsKey] = useState(0);
  const [branchesKey, setBranchesKey] = useState(0);
  return (
    <>
      <ChangeRequestsPanel
        isSystemAdmin={adminScope.phamVi === 'ToanHeThong'}
        refreshKey={requestsKey}
        onChanged={() => setBranchesKey((value) => value + 1)}
      />
      <BranchPage
        refreshKey={branchesKey}
        onUpdated={() => setRequestsKey((value) => value + 1)}
      />
    </>
  );
}
