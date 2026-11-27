import { useCallback, useState } from 'react';
import { usePolling } from '../../../shared/hooks/use-polling';
import { getChatUnreadCount } from '../api/chat-api';

// Số hội thoại có tin chưa đọc cho mục "Tin nhắn" ở menu (chat F1, PLAN chat 5.9, 5.13; Q15). Thăm dò 30 giây bằng vòng dùng chung với chuông (T10):
// tab ẩn tạm dừng, focus gọi ngay, mất mạng dừng, lỗi giữ số cũ. Router gọi MỘT lần cho khung đang mở rồi truyền số xuống menu, để `features/patient`
// và `features/doctor` không import `features/chat`. Số sống trong state của hook nên khung gỡ (đăng xuất, đổi vai trò) là số mất theo.

/** Nhịp thăm dò, bằng chuông thông báo (X1 M2 của chat đo ở 30 giây). */
export const CHAT_UNREAD_POLL_MS = 30_000;

/** Chưa có lần đọc nào thành công ⇒ 0 (ẩn số, không hiện số giả). */
export function useChatUnreadCount(): number {
  const [count, setCount] = useState(0);
  const poll = useCallback(async (signal: AbortSignal) => {
    setCount(await getChatUnreadCount(signal));
  }, []);
  usePolling(poll, CHAT_UNREAD_POLL_MS);
  return count;
}
