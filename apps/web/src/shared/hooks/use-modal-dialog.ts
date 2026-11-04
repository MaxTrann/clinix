import { useEffect, useRef, type RefObject } from 'react';

// Phần tử nhận được Tab (phần tử `disabled` và `tabindex="-1"` bị bỏ qua)
const TABBABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export interface ModalDialogOptions {
  open: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  // Nhận focus khi mở
  initialFocusRef: RefObject<HTMLElement | null>;
  // Nút mở: nhận lại focus khi đóng, nếu nút còn trong trang
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}

// Hành vi hộp thoại kiểu modal tự viết (patient F11, TRACKING F11-C): không dùng `<dialog>` gốc vì happy-dom không bẫy focus
// và không đóng bằng Esc, test sẽ không kiểm được. Phần nền phải được nơi gọi đặt `inert`; hook chỉ lo focus, phím và khoá cuộn.
export function useModalDialog({
  open,
  dialogRef,
  initialFocusRef,
  returnFocusRef,
  onClose,
}: ModalDialogOptions): void {
  // Giữ hàm đóng mới nhất mà không phải gắn lại bộ nghe phím mỗi lần render
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const overflowBefore = body.style.overflow;
    const trigger = returnFocusRef.current;
    body.style.overflow = 'hidden';
    initialFocusRef.current?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      const dialog = dialogRef.current;
      if (event.key !== 'Tab' || !dialog) return;
      const stops = Array.from(dialog.querySelectorAll<HTMLElement>(TABBABLE));
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      const current = document.activeElement;
      let next: HTMLElement | null = null;
      if (!(current instanceof Node) || !dialog.contains(current)) {
        // Focus đang ở ngoài (ví dụ ở body sau khi bấm vào chỗ trống): kéo về trong hộp thoại
        next = event.shiftKey ? last : first;
      } else if (event.shiftKey && current === first) {
        next = last;
      } else if (!event.shiftKey && current === last) {
        next = first;
      }
      if (next) {
        event.preventDefault();
        next.focus();
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      // Trả đúng giá trị cũ: chạy cả khi đóng, khi chuyển sang màn rộng và khi gỡ khung (đăng xuất thành công)
      body.style.overflow = overflowBefore;
      // Gỡ khung hoặc chuyển sang màn rộng thì nút mở đã rời trang: không trả focus
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open, dialogRef, initialFocusRef, returnFocusRef]);
}
