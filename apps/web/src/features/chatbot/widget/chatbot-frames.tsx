import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useInertBackground } from '../../../shared/hooks/use-inert-background';
import { useModalDialog } from '../../../shared/hooks/use-modal-dialog';

interface FrameProps {
  id: string;
  label: string;
  // Phần tử nhận tiêu điểm đầu khi mở: nút "Tôi hiểu" hay ô nhập (do khối bên trong gắn)
  focusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}

// Màn rộng (từ 640 px): hộp KHÔNG chặn trang (PLAN 5.14): không `aria-modal`, không bẫy Tab, trang phía sau vẫn dùng được. Esc đóng khi tiêu điểm ở trong hộp.
export function WideFrame({
  id,
  label,
  focusRef,
  onClose,
  children,
}: FrameProps) {
  useEffect(() => {
    focusRef.current?.focus();
  }, [focusRef]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onClose();
  }

  return (
    <div
      id={id}
      role="dialog"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className="fixed right-4 bottom-[5.25rem] z-40 flex h-[500px] max-h-[calc(100dvh-6.5rem)] w-[520px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"
    >
      {children}
    </div>
  );
}

// Màn hẹp (dưới 640 px): chiếm toàn màn hình, modal thật: phần còn lại của trang `inert`, khoá cuộn, bẫy Tab, Esc đóng và trả tiêu điểm về nút mở.
// `createPortal` vào `body` vì `useInertBackground` đặt `inert` cho mọi phần tử con khác của `body`. Gọi `useInertBackground` TRƯỚC `useModalDialog`
// (chú thích của hai hook): `inert` phải gỡ trước khi tiêu điểm trả về nút mở.
export function NarrowFrame({
  id,
  label,
  focusRef,
  returnFocusRef,
  onClose,
  children,
}: FrameProps & { returnFocusRef: RefObject<HTMLElement | null> }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  useInertBackground(overlayRef);
  useModalDialog({
    open: true,
    dialogRef: overlayRef,
    initialFocusRef: focusRef,
    returnFocusRef,
    onClose,
  });
  return createPortal(
    <div
      ref={overlayRef}
      id={id}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white"
    >
      {children}
    </div>,
    document.body,
  );
}
