import { request } from '../../../shared/api/client';
import type {
  HistoryPage,
  SystemConfig,
  UpdateSystemConfigBody,
} from './system-config-types';

// Gọi API cấu hình hệ thống (B5, B6) qua lớp client duy nhất. Chỉ Quản trị viên Toàn hệ thống; vai trò khác nhận 403.
export const HISTORY_PAGE_SIZE = 20;

export function getSystemConfig(signal?: AbortSignal): Promise<SystemConfig> {
  return request<SystemConfig>('/admin/system-config', { signal });
}

// Một lần gửi, không tự thử lại (lệnh ghi): mất mạng hay hết hạn chờ thì người dùng tự bấm lại.
export function updateSystemConfig(
  body: UpdateSystemConfigBody,
): Promise<SystemConfig> {
  return request<SystemConfig>('/admin/system-config', {
    method: 'PUT',
    json: body,
  });
}

export function getSystemConfigHistory(
  page: number,
  signal?: AbortSignal,
): Promise<HistoryPage> {
  return request<HistoryPage>('/admin/system-config/history', {
    query: { page, pageSize: HISTORY_PAGE_SIZE },
    signal,
  });
}
