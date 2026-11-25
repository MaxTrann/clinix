import { useEffect, useSyncExternalStore } from 'react';
import { useOnlineStatus } from '../../../shared/hooks/use-online-status';
import { getUnreadCount } from '../api/notification-api';
import {
  getUnreadSnapshot,
  resetUnreadStore,
  setUnreadCount,
  subscribeUnread,
  type UnreadSnapshot,
} from './unread-store';

// Thăm dò số chưa đọc (notification F1, PLAN 5.5; Q1: thăm dò, không SSE hay WebSocket). Router gọi hook này MỘT lần cho khung đang mở rồi truyền số xuống khung
// qua prop, để `features/patient` và `features/doctor` không import `features/notification` (WTB-16).

/** Nhịp thăm dò (X1 M2 PASS ở 30 giây). */
export const UNREAD_POLL_MS = 30_000;

export function useUnreadCount(): UnreadSnapshot {
  const online = useOnlineStatus();

  useEffect(() => {
    // Mất mạng: tạm dừng hẳn; có mạng lại thì effect chạy lại và gọi ngay (WTB-04)
    if (!online) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: AbortController | null = null;
    let stopped = false;

    // `setTimeout` nối tiếp, không `setInterval`: lượt sau chỉ hẹn khi lượt trước xong, nên lời gọi chậm không chồng lời gọi (WTB-02)
    const tick = async () => {
      // Tab ẩn thì không gọi và KHÔNG hẹn lượt sau (tạm dừng tới khi tab hiện lại). Không cần kiểm lời gọi đang bay ở đây: hẹn giờ chỉ đặt sau khi lời gọi xong
      if (document.visibilityState !== 'visible') return;
      const controller = new AbortController();
      inFlight = controller;
      try {
        setUnreadCount(await getUnreadCount(controller.signal));
      } catch {
        // Mạng, 5xx, quá giờ, phản hồi hỏng: giữ số cũ, không hộp lỗi, thử lại ở nhịp sau (WTB-04).
        // 401 do lớp client làm mới phiên; không phục hồi được thì phiên kết thúc và khung gỡ, nên không có vòng lặp
      } finally {
        inFlight = null;
        if (!stopped) timer = setTimeout(() => void tick(), UNREAD_POLL_MS);
      }
    };

    // Tab hiện lại hay cửa sổ được focus: gọi ngay một lần thay cho lượt đang hẹn. Lời gọi trước chưa xong thì bỏ lượt (không chồng lời gọi)
    const wake = () => {
      if (document.visibilityState !== 'visible' || inFlight !== null) return;
      clearTimeout(timer);
      void tick();
    };

    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    void tick();

    return () => {
      stopped = true;
      clearTimeout(timer);
      inFlight?.abort();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, [online]);

  // Khung gỡ (đăng xuất, đổi vai trò): xoá số để tài khoản sau không thấy số cũ
  useEffect(() => resetUnreadStore, []);

  return useSyncExternalStore(subscribeUnread, getUnreadSnapshot);
}
