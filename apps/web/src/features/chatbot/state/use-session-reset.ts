import { useLayoutEffect, useRef } from 'react';
import { useAuth } from '../../auth';

// Gọi `onSessionEnd` khi phiên đăng nhập kết thúc: `authenticated` sang `unauthenticated` (bấm Đăng xuất, hết phiên). Đổi tài khoản cũng đi qua
// đây vì trang đăng nhập chuyển người đã đăng nhập đi. `AuthUser` không có id tài khoản nên không thể so hai tài khoản trực tiếp.
// Đăng nhập (`unauthenticated` sang `authenticated`) KHÔNG xoá: lịch sử của khách chỉ có hỏi đáp công khai (Đại duyệt 27/11/2026, Đ3).
// `useLayoutEffect`: xoá trước khi trình duyệt vẽ, để người kế tiếp không thoáng thấy hội thoại cũ.
export function useSessionReset(onSessionEnd: () => void): void {
  const { status } = useAuth();
  const previous = useRef(status);
  useLayoutEffect(() => {
    if (previous.current === 'authenticated' && status === 'unauthenticated') {
      onSessionEnd();
    }
    previous.current = status;
  }, [status, onSessionEnd]);
}
