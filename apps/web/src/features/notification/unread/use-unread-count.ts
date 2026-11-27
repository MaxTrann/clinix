import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { usePolling } from '../../../shared/hooks/use-polling';
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
// chat F1 (T10): vòng thăm dò (nhịp nối tiếp, tab ẩn, focus, mất mạng, gỡ; WTB-02, WTB-04) chuyển sang `shared/hooks/use-polling.ts`, hành vi không đổi.

/** Nhịp thăm dò (X1 M2 PASS ở 30 giây). */
export const UNREAD_POLL_MS = 30_000;

export function useUnreadCount(): UnreadSnapshot {
  const poll = useCallback(async (signal: AbortSignal) => {
    setUnreadCount(await getUnreadCount(signal));
  }, []);
  usePolling(poll, UNREAD_POLL_MS);

  // Khung gỡ (đăng xuất, đổi vai trò): xoá số để tài khoản sau không thấy số cũ
  useEffect(() => resetUnreadStore, []);

  return useSyncExternalStore(subscribeUnread, getUnreadSnapshot);
}
