import { useEffect, useRef } from 'react';
import { useOnlineStatus } from './use-online-status';

// Thăm dò dùng chung (chat F1, T10): tách nguyên văn vòng thăm dò của chuông thông báo (notification F1, PLAN notification 5.5) để số "Tin nhắn" của chat
// dùng lại, hành vi chuông KHÔNG đổi (các ca WTB-02, WTB-04 của `use-unread-count.test.tsx` giữ nguyên).
//
// Luật của vòng thăm dò:
//  - gọi ngay khi gắn, rồi hẹn lượt sau bằng `setTimeout` NỐI TIẾP (không `setInterval`): lượt sau chỉ hẹn khi lượt trước xong, nên lời gọi chậm không chồng;
//  - tab ẩn: không gọi, không hẹn (tạm dừng); tab hiện lại hay cửa sổ được focus: gọi ngay một lần thay cho lượt đang hẹn, trừ khi lời gọi trước chưa xong;
//  - mất mạng: dừng hẳn; có mạng lại: effect chạy lại và gọi ngay;
//  - gỡ: huỷ lời gọi đang bay (`AbortSignal`), bỏ hẹn giờ và listener.
// `task` tự xử lý kết quả; lỗi `task` ném ra bị nuốt (giữ dữ liệu cũ, thử lại ở nhịp sau), nên `task` không cần tự bắt lỗi mạng.

export function usePolling(
  task: (signal: AbortSignal) => Promise<void>,
  intervalMs: number,
): void {
  const online = useOnlineStatus();
  // Luôn gọi `task` mới nhất mà không khởi động lại vòng thăm dò mỗi lần render
  const latestTask = useRef(task);
  useEffect(() => {
    latestTask.current = task;
  }, [task]);

  useEffect(() => {
    if (!online) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: AbortController | null = null;
    let stopped = false;

    const tick = async () => {
      // Không cần kiểm lời gọi đang bay ở đây: hẹn giờ chỉ đặt sau khi lời gọi xong
      if (document.visibilityState !== 'visible') return;
      const controller = new AbortController();
      inFlight = controller;
      try {
        await latestTask.current(controller.signal);
      } catch {
        // Mạng, 5xx, quá giờ, phản hồi hỏng: giữ dữ liệu cũ, không hộp lỗi, thử lại ở nhịp sau.
        // 401 do lớp client làm mới phiên; không phục hồi được thì phiên kết thúc và khung gỡ, nên không có vòng lặp
      } finally {
        inFlight = null;
        if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
      }
    };

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
  }, [online, intervalMs]);
}
