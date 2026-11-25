import { request } from '../../../../../shared/api/client';
import {
  parseApproveResult,
  parseRejectResult,
} from '../../common/reschedule-requests/request-handle-readers';
import type { RescheduleRequestHandlers } from '../../common/reschedule-requests/request-handle-types';
import { RECEPTION_REQUESTS_BASE } from './reception-requests-api';

// Gọi và kiểm hình dạng hai route GHI của Lễ tân (reschedule F4 Pha B1; B9, chưa merge: hợp đồng ở `common/reschedule-requests/request-handle-readers.ts`): `POST /reception/reschedule-requests/:yeuCauId/approve` và
// `…/reject`. Route của Lễ tân nên GẮN access token (mặc định của `request()`); chi nhánh do backend đọc từ `le_tan` mỗi lần gọi, KHÔNG có tham số nào từ client là phạm vi. POST KHÔNG truyền `signal` (nếp F2, F9): yêu cầu
// đã gửi thì máy chủ vẫn xử lý dù trang bị gỡ. Id đi nguyên chuỗi, `encodeURIComponent`. Thất bại ném `ApiError` (`maLoi`), mạng đứt ném `NetworkError`, 200 sai hình dạng ném `UnexpectedResponseError`.
const post = (yeuCauId: string, action: 'approve' | 'reject', json: unknown) =>
  request<unknown>(
    `${RECEPTION_REQUESTS_BASE}/${encodeURIComponent(yeuCauId)}/${action}`,
    { method: 'POST', json },
  );

export const receptionRequestHandlers: RescheduleRequestHandlers = {
  approve: async (yeuCauId, body) =>
    parseApproveResult(await post(yeuCauId, 'approve', body)),
  reject: async (yeuCauId, body) =>
    parseRejectResult(await post(yeuCauId, 'reject', body)),
};
