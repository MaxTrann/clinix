import { useParams } from 'react-router';
import {
  RECEPTION_RESCHEDULE_REQUESTS_PATH,
  receptionRescheduleRequestDetailPath,
} from '../../../../../shared/routes/booking-paths';
import { isRequestId } from '../../common/reschedule-requests/request-query-state';
import { RequestDetailPage } from '../../common/reschedule-requests/request-detail-page';
import { RequestDetailView } from '../../common/reschedule-requests/request-detail-view';
import { RequestListView } from '../../common/reschedule-requests/request-list-view';
import { REQUEST_TEXT } from '../../common/reschedule-requests/request-text';
import { receptionRequestsApi } from './reception-requests-api';
import { receptionRequestHandlers } from './reception-requests-handle-api';

// Hai trang "Yêu cầu đổi lịch" của Lễ tân (reschedule F4; PLAN reschedule 5.12): ghép thành phần dùng chung ở `common/reschedule-requests` với API và đường dẫn của Lễ tân. Mỏng cố ý: mọi hành vi ở thành phần
// dùng chung để F5 (Quản trị viên) ghép lại với `admin/…`. Cổng theo vai trò do `RequireAuth roles={['LeTan']}` của `createRoleRoutes` bọc cả khối nên vai khác không vào.

// Trang danh sách: h1 và phụ đề của trang rồi thân dùng chung (hai tab, lọc, bảng)
export function ReceptionRescheduleRequestsPage() {
  return (
    <section>
      <h1 className="text-2xl font-bold text-gray-900">{REQUEST_TEXT.title}</h1>
      <p className="pt-1 pb-4 text-sm leading-normal text-gray-600">
        {REQUEST_TEXT.subtitle}
      </p>
      <RequestListView
        api={receptionRequestsApi}
        detailPath={receptionRescheduleRequestDetailPath}
      />
    </section>
  );
}

function ReceptionRescheduleRequestDetailPage({
  yeuCauId,
}: {
  yeuCauId: string;
}) {
  return (
    <RequestDetailPage
      api={receptionRequestsApi}
      handlers={receptionRequestHandlers}
      yeuCauId={yeuCauId}
      listPath={RECEPTION_RESCHEDULE_REQUESTS_PATH}
    />
  );
}

// Phần tử của route: đọc id từ đường dẫn và đặt `key` theo id, nên đổi sang yêu cầu khác thì trang dựng lại và bản cũ của yêu cầu khác không bao giờ hiện cho yêu cầu mới.
// Id sai dạng KHÔNG gọi API (`view = null`): cùng câu "không tìm thấy" như 404 của máy chủ.
export function ReceptionRescheduleRequestDetailRoute() {
  const { yeuCauId = '' } = useParams();
  if (!isRequestId(yeuCauId)) {
    return (
      <RequestDetailView
        key={yeuCauId}
        view={null}
        reload={noop}
        listPath={RECEPTION_RESCHEDULE_REQUESTS_PATH}
      />
    );
  }
  return (
    <ReceptionRescheduleRequestDetailPage key={yeuCauId} yeuCauId={yeuCauId} />
  );
}

function noop() {
  // Không có gì để tải lại: id sai dạng
}
