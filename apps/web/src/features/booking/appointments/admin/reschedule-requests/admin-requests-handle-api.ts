import { request } from '../../../../../shared/api/client';
import {
  parseApproveResult,
  parseRejectResult,
} from '../../common/reschedule-requests/request-handle-readers';
import type { RescheduleRequestHandlers } from '../../common/reschedule-requests/request-handle-types';
import { ADMIN_REQUESTS_BASE } from './admin-requests-api';

// Gọi và kiểm hình dạng hai route GHI của Quản trị viên (reschedule F5; B9): `POST /admin/reschedule-requests/:yeuCauId/approve` và `…/reject`. Thân và kết quả giống của Lễ tân (một hợp đồng), nên dùng lại bộ đọc ở
// `common/reschedule-requests`. Route GẮN access token (mặc định của `request()`); phạm vi chi nhánh do backend ép, thân KHÔNG có tham số chi nhánh (khoá lạ ⇒ 400). POST KHÔNG truyền `signal` (nếp F2, F9): yêu cầu đã gửi
// thì máy chủ vẫn xử lý dù trang bị gỡ. Id đi nguyên chuỗi, `encodeURIComponent`.
const post = (yeuCauId: string, action: 'approve' | 'reject', json: unknown) =>
  request<unknown>(
    `${ADMIN_REQUESTS_BASE}/${encodeURIComponent(yeuCauId)}/${action}`,
    { method: 'POST', json },
  );

export const adminRequestHandlers: RescheduleRequestHandlers = {
  approve: async (yeuCauId, body) =>
    parseApproveResult(await post(yeuCauId, 'approve', body)),
  reject: async (yeuCauId, body) =>
    parseRejectResult(await post(yeuCauId, 'reject', body)),
};
