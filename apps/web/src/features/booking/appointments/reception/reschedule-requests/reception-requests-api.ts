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
import { getReceptionReschedulePreview } from '../reschedule/reception-reschedule-api';

// Gọi và kiểm hình dạng hai route ĐỌC của Lễ tân (reschedule F4; B8): `GET /reception/reschedule-requests` và `GET /reception/reschedule-requests/:yeuCauId`. Route của Lễ tân nên GẮN access token (mặc định của
// `request()`); chi nhánh do backend đọc từ `le_tan` ở DB mỗi lần gọi, nên KHÔNG có tham số nào từ client là phạm vi dữ liệu (gửi `chiNhanhId` là khoá lạ ⇒ 400). Bộ đọc NGHIÊM ở `common/reschedule-requests`.
// Chỉ các khoá B8 nhận: `trangThai` luôn gửi (tab Chờ duyệt là `ChoDuyet`, tab Đã xử lý là `DaDuyet,TuChoi`), `page` luôn gửi; `bacSiId` và `q` chỉ gửi khi có (`q=` rỗng là 400). Giá trị là chuỗi: id BIGINT
// không qua `Number`.
export const RECEPTION_REQUESTS_BASE = 'reception/reschedule-requests';
const BASE = RECEPTION_REQUESTS_BASE;

export function buildReceptionRequestsQuery(
  query: RequestQuery,
): Record<string, string | number> {
  const params: Record<string, string | number> = {
    trangThai: tabStatuses(query.tab),
    page: query.page,
  };
  if (query.bacSiId !== '') params.bacSiId = query.bacSiId;
  if (query.q !== '') params.q = query.q;
  return params;
}

export const receptionRequestsApi: RescheduleRequestsApi = {
  list: async (query, signal) =>
    parseRequestPage(
      await request<unknown>(BASE, {
        query: buildReceptionRequestsQuery(query),
        signal,
      }),
    ),
  get: async (yeuCauId, signal) =>
    parseRequestDetail(
      await request<unknown>(`${BASE}/${encodeURIComponent(yeuCauId)}`, {
        signal,
      }),
    ),
  // Chi tiết B8 không có id bác sĩ: hỏi preview đổi hộ của B7 (chỉ đọc, không khoá) qua bộ đọc NGHIÊM của F3, CHỈ lấy `lichCu.bacSiId` (Pha B2; kế hoạch 1.16 mục 2.7). Gọi khi người dùng bấm, không gọi trước.
  resolveDoctorId: async (detail, signal) =>
    (await getReceptionReschedulePreview(detail.maLichHen, null, signal)).lichCu
      .bacSiId,
};
