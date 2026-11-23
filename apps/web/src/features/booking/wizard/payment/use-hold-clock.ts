import { useEffect, useState } from 'react';
import { holdRemainingSeconds } from './hold-countdown';

// Hẹn giờ dày hơn 1 giây để số không nhảy cóc khi hẹn giờ nổ lệch một chút (nếp `use-lock-countdown.ts` của auth; `features/` không import chéo nên không dùng thẳng được)
const TICK_MS = 250;

// Đồng hồ giữ chỗ (booking F6, WZ-10). Trả số giây còn lại (`null` khi lịch không có hạn). Thành phần dùng hook này phải có `key` theo từng lần nhận dữ liệu: mỗi lần tải lại là MỘT đồng hồ mới,
// nên giá trị đầu không phải đặt lại bằng effect.
//  - Giá trị ĐẦU tính thuần từ dữ liệu (`hạn − thoiGianMayChu`), không đọc đồng hồ máy: luật `react-hooks/purity` cấm `Date.now()` lúc render, và nhờ đó vừa tải xong không có khung hình
//    "00:00" hay rỗng, tải lại không nhảy chữ.
//  - Mỗi nhịp tính LẠI từ đồng hồ (`Date.now()` cộng chênh đã đo lúc nhận), KHÔNG trừ dần: tab nền bị trình duyệt giãn hẹn giờ. `visibilitychange` tính lại ngay khi tab quay lại.
//  - Chỉ `setState` khi SỐ GIÂY HIỂN THỊ đổi (không vẽ lại 4 lần mỗi giây).
//  - Về 0 BẰNG NHỊP: dừng nhịp và gọi `onEnded` đúng MỘT lần (nơi gọi tải lại chi tiết, để máy chủ quyết). Đã hết hạn ngay lúc tải thì KHÔNG nhịp, KHÔNG `onEnded`: dữ liệu vừa về từ máy chủ rồi,
//    tải lại nữa sẽ thành vòng lặp.
export function useHoldClock({
  hanThanhToan,
  thoiGianMayChu,
  offsetMs,
  onEnded,
}: {
  hanThanhToan: string | null;
  thoiGianMayChu: string;
  offsetMs: number;
  onEnded: () => void;
}): number | null {
  const [remaining, setRemaining] = useState(() =>
    holdRemainingSeconds(hanThanhToan, Date.parse(thoiGianMayChu)),
  );

  useEffect(() => {
    if (hanThanhToan === null) return;
    let shown = holdRemainingSeconds(hanThanhToan, Date.parse(thoiGianMayChu));
    if (shown === null || shown <= 0) return;

    function tick() {
      const left = holdRemainingSeconds(hanThanhToan, Date.now() + offsetMs);
      if (left === null || left === shown) return;
      shown = left;
      setRemaining(left);
      if (left === 0) {
        stop();
        onEnded();
      }
    }
    function stop() {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    }

    const timer = setInterval(tick, TICK_MS);
    document.addEventListener('visibilitychange', tick);
    return stop;
  }, [hanThanhToan, thoiGianMayChu, offsetMs, onEnded]);

  return remaining;
}
