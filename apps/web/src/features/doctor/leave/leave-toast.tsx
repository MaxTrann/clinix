import { useEffect } from 'react';
import { CircleCheck } from 'lucide-react';

export const LEAVE_CREATED_MESSAGE =
  'Yêu cầu nghỉ đã được gửi và đang chờ Admin duyệt.';
const AUTO_HIDE_MS = 6000;

// Thông báo thành công ở góc phải trên (Figma `470:2`). `role="status"` (đọc nhẹ, không ngắt); tự ẩn sau vài giây.
export function LeaveToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <p
      role="status"
      className="fixed top-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg bg-green-700 px-4 py-3 text-sm font-medium text-white shadow-lg"
    >
      <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
      {message}
    </p>
  );
}
