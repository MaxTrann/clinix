import { useEffect, type RefObject } from 'react';

// Làm phần còn lại của trang `inert` trong lúc một hộp thoại modal (ngăn kéo chi tiết của Lễ tân, booking F8) đang mở. `useModalDialog` chỉ lo focus, phím Esc
// và khoá cuộn; nền phải do nơi gọi đặt `inert` (chú thích của hook đó). Hộp thoại được `createPortal` vào `body`, nên nền là MỌI phần tử con khác của `body`
// (gốc React, và các portal khác nếu có). Chỉ gỡ ĐÚNG những phần tử mình đã đặt: phần tử đã `inert` từ trước vẫn `inert` sau khi đóng.
// PHẢI gọi TRƯỚC `useModalDialog`: cleanup chạy theo thứ tự khai báo, nên `inert` được gỡ trước khi hook trả focus về nút đã mở (phần tử `inert` không nhận focus).
export function useInertBackground(overlayRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const overlay = overlayRef.current;
    const touched = Array.from(document.body.children).filter(
      (element) => element !== overlay && !element.hasAttribute('inert'),
    );
    for (const element of touched) element.setAttribute('inert', '');
    return () => {
      for (const element of touched) element.removeAttribute('inert');
    };
  }, [overlayRef]);
}
