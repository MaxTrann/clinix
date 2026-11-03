import { useEffect, useRef } from 'react';

// `useNavigate` của react-router 8 vẫn chuyển trang khi component đã bị gỡ (ref `activeRef` của nó không bao giờ về false).
// Biểu mẫu chờ API rồi mới `navigate`: người dùng đã rời trang thì phản hồi về sau không được kéo họ quay lại.
// Mọi chỗ `await` một lời gọi API phải kiểm `active.current` trước khi chuyển trang hoặc đổi state.
export function usePageActive() {
  const active = useRef(false);
  useEffect(() => {
    // StrictMode chạy effect, dọn, rồi chạy lại: lần chạy lại đặt true trở lại
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return active;
}
