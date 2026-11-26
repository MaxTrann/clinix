import { request } from '../../../../../shared/api/client';
import { tabStatuses } from '../../common/reschedule-requests/request-query-state';
import {
  parseRequestDetail,
  parseRequestPage,
} from '../../common/reschedule-requests/request-readers';
import type {
  RequestQuery,
  RescheduleRequestsApi,
} from '../../common/reschedule-requests/request-types';

// Gọi và kiểm hình dạng hai route ĐỌC của Quản trị viên (reschedule F5; B8): `GET /admin/reschedule-requests` và `GET /admin/reschedule-requests/:yeuCauId`. Cùng hình dạng với Lễ tân nên dùng lại bộ đọc NGHIÊM ở
// `common/reschedule-requests`; chỉ khác đường dẫn và tham số `chiNhanhId`. Route của Quản trị viên nên GẮN access token (mặc định của `request()`).
// `chiNhanhId` CHỈ gửi khi có chọn (chuỗi khác rỗng): Quản trị viên Toàn hệ thống lọc theo chi nhánh; Chi nhánh thì máy chủ BỎ QUA tham số này nên web không bao giờ gửi (layout ép chuỗi rỗng). Máy chủ mới là nơi
// ép phạm vi dữ liệu (B8): tham số từ client không mở rộng được quyền. Chi tiết không có `chiNhanhId` (ngoài phạm vi ra 404 cùng thân).
export const ADMIN_REQUESTS_BASE = 'admin/reschedule-requests';

export function buildAdminRequestsQuery(
  query: RequestQuery,
  chiNhanhId: string,
): Record<string, string | number> {
  const params: Record<string, string | number> = {
    trangThai: tabStatuses(query.tab),
    page: query.page,
  };
  if (query.bacSiId !== '') params.bacSiId = query.bacSiId;
  if (query.q !== '') params.q = query.q;
  if (chiNhanhId !== '') params.chiNhanhId = chiNhanhId;
  return params;
}

// Mỗi chi nhánh một đối tượng API; nơi gọi giữ ỔN ĐỊNH (`useMemo`) vì hook danh sách không đưa `api` vào danh sách phụ thuộc
export function createAdminRequestsApi(chiNhanhId = ''): RescheduleRequestsApi {
  return {
    list: async (query, signal) =>
      parseRequestPage(
        await request<unknown>(ADMIN_REQUESTS_BASE, {
          query: buildAdminRequestsQuery(query, chiNhanhId),
          signal,
        }),
      ),
    get: async (yeuCauId, signal) =>
      parseRequestDetail(
        await request<unknown>(
          `${ADMIN_REQUESTS_BASE}/${encodeURIComponent(yeuCauId)}`,
          { signal },
        ),
      ),
  };
}

// Bản không chọn chi nhánh, một đối tượng cố định cho trang chi tiết
export const adminRequestsApi = createAdminRequestsApi();
