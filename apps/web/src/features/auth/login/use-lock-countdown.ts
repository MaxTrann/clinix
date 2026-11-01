import { useCallback, useEffect, useState } from 'react';

// Hẹn giờ dày hơn 1 giây để số không nhảy cóc khi hẹn giờ nổ lệch một chút
const TICK_MS = 250;

export function formatCountdown(seconds: number): string {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const rest = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

export interface LockCountdown {
  // Số giây còn lại; lớn hơn 0 nghĩa là đang khoá
  remaining: number;
  // Vừa đếm hết (khác với chưa từng khoá): giao diện khai báo mở khoá đúng một lần
  expired: boolean;
  start(seconds: number): void;
}

// Đếm theo `soGiayConLai` của phản hồi và mốc đơn điệu `performance.now`, KHÔNG theo `khoaDen` và đồng hồ máy (có thể lệch so với máy chủ).
export function useLockCountdown(): LockCountdown {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [expired, setExpired] = useState(false);

  const start = useCallback((seconds: number) => {
    setDeadline(performance.now() + seconds * 1000);
    setRemaining(Math.ceil(seconds));
    setExpired(false);
  }, []);

  useEffect(() => {
    if (deadline === null) return;

    const tick = () => {
      const left = Math.ceil((deadline - performance.now()) / 1000);
      if (left > 0) {
        setRemaining(left);
        return;
      }
      setRemaining(0);
      setExpired(true);
      setDeadline(null);
    };

    const timer = setInterval(tick, TICK_MS);
    // Tab nền bị trình duyệt giãn hẹn giờ: quay lại thì tính lại ngay
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [deadline]);

  return { remaining, expired, start };
}
