import { request } from '../../../shared/api/client';
import { UnexpectedResponseError } from '../../../shared/api/errors';

// Gọi API Trung tâm thông báo (notification B2, PLAN 5.4). F1 chỉ cần số chưa đọc; danh sách, chi tiết và đánh dấu do F2 thêm vào file này.
// Route của bốn vai trò, GẮN access token (mặc định của `request()`); tài khoản do backend lấy từ token, web không gửi id nào.
// Phản hồi sai hình dạng ⇒ `UnexpectedResponseError`: hook thăm dò coi như một lần lỗi và giữ số cũ, không để `undefined` lọt lên chuông.

export const UNREAD_COUNT_PATH = '/notifications/unread-count';

export function parseUnreadCount(raw: unknown): number {
  const value =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>).soChuaDoc
      : undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    throw new UnexpectedResponseError(200);
  return value;
}

export async function getUnreadCount(signal?: AbortSignal): Promise<number> {
  return parseUnreadCount(await request(UNREAD_COUNT_PATH, { signal }));
}
