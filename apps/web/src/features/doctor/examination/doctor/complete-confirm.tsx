import { CalendarCheck } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { COMPLETE_TEXT } from '../exam-messages';

// Hàng xác nhận NGAY TRÊN hàng tiêu đề (Figma `461:2`; Đại chọn "theo Figma: dòng xác nhận tại chỗ", 15/11/2026): chữ `Xác nhận hoàn thành?`, nút `Xác nhận` (nền
// chính, biểu tượng 13,125 px) và nút `Hủy` (viền). KHÔNG phải hộp modal: không lớp phủ, không `inert` nền, không bẫy Tab.
//  - `role="group"` có tên để trình đọc màn hình biết hai nút thuộc về câu hỏi nào;
//  - tiêu điểm vào `Hủy` khi hàng hiện ra (nút an toàn như `Giữ lịch` ở booking F2: nút `Hoàn thành ca khám` vừa bấm đã biến mất, và Enter không được xác nhận nhầm);
//  - Esc trong hàng = `Hủy`; đang gửi thì Esc và `Hủy` không có tác dụng (không đóng giữa chừng: người dùng sẽ không biết kết quả).
// Chỉ ĐƯỢC dựng khi hàng đang mở, nên hiệu ứng tiêu điểm chạy đúng một lần cho mỗi lần mở (503 giữ hàng mở: không dựng lại).
const BUTTON =
  'inline-flex items-center rounded-[13.375px] px-3 py-1.5 text-sm whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60';

export function CompleteConfirm({
  busy,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape' || busy) return;
    event.preventDefault();
    onCancel();
  }

  return (
    <div
      role="group"
      aria-label={COMPLETE_TEXT.groupLabel}
      aria-busy={busy}
      onKeyDown={handleKeyDown}
      className="flex flex-wrap items-center justify-end gap-2"
    >
      <span className="text-sm whitespace-nowrap text-gray-600">
        {COMPLETE_TEXT.prompt}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={onConfirm}
        className={`${BUTTON} gap-1.5 bg-brand-strong font-semibold text-white transition-colors hover:bg-cyan-800`}
      >
        <CalendarCheck aria-hidden="true" className="size-3.5" />
        {busy ? COMPLETE_TEXT.confirming : COMPLETE_TEXT.confirm}
      </button>
      <button
        ref={cancelRef}
        type="button"
        disabled={busy}
        onClick={onCancel}
        className={`${BUTTON} border border-gray-300 font-medium text-gray-600 transition-colors hover:bg-gray-50`}
      >
        {COMPLETE_TEXT.cancel}
      </button>
    </div>
  );
}
