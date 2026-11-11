import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useModalDialog } from '../../../shared/hooks/use-modal-dialog';

export interface ModalFrameProps {
  title: string;
  // Phần tử nhận focus khi mở (nút Đóng, ô nhập đầu tiên…)
  initialFocusRef: RefObject<HTMLElement | null>;
  // Nút đã mở hộp thoại: nhận lại focus khi đóng
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  // Đang gửi: Esc, bấm nền và nút × không đóng (yêu cầu không huỷ được, đóng giữa chừng thì người dùng không biết kết quả)
  busy?: boolean;
  // Hiện nút × ở góc (Figma `468:2`, `471:2`; hộp `469:2` không có)
  showCloseIcon?: boolean;
  widthClass?: string;
  children: ReactNode;
}

// Khung hộp thoại modal dùng chung của module doctor (Chi tiết ca, Yêu cầu nghỉ, Chi tiết yêu cầu): nền mờ, `inert` phần còn lại của trang,
// bẫy focus/Esc/khoá cuộn do `useModalDialog`. Chỉ được dựng khi hộp thoại MỞ (nơi gọi quyết định bằng điều kiện), nên `open` luôn true.
export function ModalFrame({
  title,
  initialFocusRef,
  returnFocusRef,
  onClose,
  busy = false,
  showCloseIcon = false,
  widthClass = 'max-w-sm',
  children,
}: ModalFrameProps) {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Nền `inert` (như hộp thoại của patient F7): chỉ gỡ đúng những phần tử mình đã đặt; khai báo TRƯỚC `useModalDialog` để cleanup gỡ `inert`
  // trước khi hook trả focus về nút đã mở (phần tử `inert` không nhận focus).
  useEffect(() => {
    const overlay = overlayRef.current;
    const touched: Element[] = [];
    for (const element of Array.from(document.body.children)) {
      if (element !== overlay && !element.hasAttribute('inert')) {
        element.setAttribute('inert', '');
        touched.push(element);
      }
    }
    return () => {
      for (const element of touched) element.removeAttribute('inert');
    };
  }, []);

  const close = () => {
    if (!busy) onClose();
  };

  useModalDialog({
    open: true,
    dialogRef,
    initialFocusRef,
    returnFocusRef,
    onClose: close,
  });

  return createPortal(
    <div
      ref={overlayRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        className={`flex max-h-[90vh] w-full flex-col rounded-xl bg-white shadow-xl ${widthClass}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
          <h2 id={titleId} className="text-base font-semibold text-gray-900">
            {title}
          </h2>
          {showCloseIcon && (
            <button
              type="button"
              aria-label="Đóng hộp thoại"
              disabled={busy}
              onClick={close}
              className="inline-flex size-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-50"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
