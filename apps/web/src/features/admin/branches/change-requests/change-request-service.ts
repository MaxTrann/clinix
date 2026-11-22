import { request } from '../../../../shared/api/client';
import type { PagedResult } from '../branch-types';
import type {
  ChangeRequestDetail,
  ChangeRequestListItem,
  ChangeRequestStatus,
} from './change-request-types';

// Gọi API yêu cầu thay đổi chi nhánh qua lớp client duy nhất (admin F6b). Phạm vi kiểm ở máy chủ: Admin Chi nhánh chỉ thấy yêu cầu
// của chi nhánh mình, chỉ Toàn hệ thống duyệt và từ chối. Lệnh ghi gửi một lần, không tự thử lại.

export const CHANGE_REQUEST_PAGE_SIZE = 20;
const PATH = '/admin/branch-change-requests';
const itemPath = (id: string) => `${PATH}/${encodeURIComponent(id)}`;

export function listChangeRequests(
  query: { trangThai: ChangeRequestStatus; page: number },
  signal?: AbortSignal,
): Promise<PagedResult<ChangeRequestListItem>> {
  return request(PATH, {
    query: {
      trangThai: query.trangThai,
      page: query.page,
      pageSize: CHANGE_REQUEST_PAGE_SIZE,
    },
    signal,
  });
}

export function getChangeRequest(
  id: string,
  signal?: AbortSignal,
): Promise<ChangeRequestDetail> {
  return request(itemPath(id), { signal });
}

/** `hieuLucTu` dạng 'YYYY-MM-DD HH:mm:ss' giờ Việt Nam (B10). */
export function approveChangeRequest(
  id: string,
  hieuLucTu: string,
): Promise<ChangeRequestDetail> {
  return request(`${itemPath(id)}/approve`, {
    method: 'POST',
    json: { hieuLucTu },
  });
}

/** Người gửi rút yêu cầu đang chờ duyệt (B21). */
export function withdrawChangeRequest(
  id: string,
): Promise<ChangeRequestDetail> {
  return request(`${itemPath(id)}/withdraw`, { method: 'POST' });
}

/** Admin Toàn hệ thống hủy yêu cầu đã duyệt mà chưa áp dụng, kể cả đang quá hạn (B21, Q47). */
export function cancelChangeRequest(
  id: string,
  lyDo: string,
): Promise<ChangeRequestDetail> {
  return request(`${itemPath(id)}/cancel`, {
    method: 'POST',
    json: { lyDo },
  });
}

/** Admin Toàn hệ thống dời thời điểm hiệu lực của yêu cầu quá hạn (B22, Q48). */
export function rescheduleChangeRequest(
  id: string,
  hieuLucTu: string,
): Promise<ChangeRequestDetail> {
  return request(`${itemPath(id)}/reschedule`, {
    method: 'POST',
    json: { hieuLucTu },
  });
}

export function rejectChangeRequest(
  id: string,
  lyDo: string,
): Promise<ChangeRequestDetail> {
  return request(`${itemPath(id)}/reject`, {
    method: 'POST',
    json: { lyDo },
  });
}
