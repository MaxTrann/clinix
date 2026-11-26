import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import {
  ADMIN_RESCHEDULE_REQUESTS_PATH,
  adminRescheduleRequestDetailPath,
} from '../../../../../shared/routes/booking-paths';
import {
  isRequestId,
  readRequestFilters,
} from '../../common/reschedule-requests/request-query-state';
import { RequestDetailPage } from '../../common/reschedule-requests/request-detail-page';
import { RequestDetailView } from '../../common/reschedule-requests/request-detail-view';
import { RequestListView } from '../../common/reschedule-requests/request-list-view';
import { REQUEST_TEXT } from '../../common/reschedule-requests/request-text';
import { AdminBranchFilter } from './admin-branch-filter';
import { adminRequestsApi, createAdminRequestsApi } from './admin-requests-api';
import { adminRequestHandlers } from './admin-requests-handle-api';
import { useAdminRequestsScope } from './admin-requests-scope';

// Hai trang "Yêu cầu đổi lịch" của Quản trị viên (reschedule F5; PLAN reschedule 5.12): route con của trang "Duyệt yêu cầu" (tiêu đề và tab do trang host của doctor đặt). Ghép thành phần dùng chung ở
// `common/reschedule-requests` với API và đường dẫn của Quản trị viên. Cổng theo vai trò do `RequireAuth roles={['QuanTriVien']}` bọc cả khối và `AdminScopeGuard policy="Any"` của khối cha.

// Chi nhánh mà danh sách đang dùng. Bộ chọn đổi chi nhánh và đưa URL về trang 1 cùng lúc, nhưng router cập nhật URL chậm hơn state một nhịp: áp ngay thì danh sách mới gọi thừa trang CŨ của chi nhánh MỚI. Nên chờ
// URL về trang 1 rồi mới áp (cập nhật state trong lúc vẽ, nếp "điều chỉnh state khi đầu vào đổi" của React).
function useAppliedBranch(): string {
  const { branch } = useAdminRequestsScope();
  const [params] = useSearchParams();
  const [applied, setApplied] = useState(branch);
  if (applied !== branch && readRequestFilters(params).page === 1) {
    setApplied(branch);
  }
  return applied;
}

// Trang danh sách: mô tả, bộ chọn chi nhánh rồi thân dùng chung. Đổi chi nhánh ⇒ dựng lại thân với API của chi nhánh đó (`key`): hook danh sách không theo dõi `api` nên không dựng lại thì không tải lại.
export function AdminRescheduleRequestsPage() {
  const branch = useAppliedBranch();
  const api = useMemo(() => createAdminRequestsApi(branch), [branch]);

  return (
    <div>
      <p className="text-sm leading-normal text-gray-600">
        {REQUEST_TEXT.subtitle}
      </p>
      <AdminBranchFilter />
      <div className="mt-4">
        <RequestListView
          key={branch}
          api={api}
          detailPath={adminRescheduleRequestDetailPath}
        />
      </div>
    </div>
  );
}

// Phần tử của route chi tiết: đọc id từ đường dẫn và đặt `key` theo id, nên đổi sang yêu cầu khác thì trang dựng lại và bản cũ của yêu cầu khác không bao giờ hiện cho yêu cầu mới.
// Id sai dạng KHÔNG gọi API (`view = null`): cùng câu "không tìm thấy" như 404 của máy chủ.
export function AdminRescheduleRequestDetailRoute() {
  const { yeuCauId = '' } = useParams();
  if (!isRequestId(yeuCauId)) {
    return (
      <RequestDetailView
        key={yeuCauId}
        view={null}
        reload={noop}
        listPath={ADMIN_RESCHEDULE_REQUESTS_PATH}
      />
    );
  }
  return (
    <RequestDetailPage
      key={yeuCauId}
      api={adminRequestsApi}
      handlers={adminRequestHandlers}
      yeuCauId={yeuCauId}
      listPath={ADMIN_RESCHEDULE_REQUESTS_PATH}
    />
  );
}

function noop() {
  // Không có gì để tải lại: id sai dạng
}
