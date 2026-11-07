import { useEffect, useRef } from 'react';

// Cờ "form còn gắn", dùng chung cho form hồ sơ (F3) và form người thân (F6): form đã bị gỡ (rời trang) thì phản hồi về sau không được
// gọi onSaved hay đổi state. `usePageActive` của auth không xuất qua index.ts. StrictMode chạy effect, dọn, rồi chạy lại: lần chạy lại
// đặt true trở lại. Đọc `.current` trong hàm xử lý bất đồng bộ, không đọc lúc render.
export function useMounted() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
