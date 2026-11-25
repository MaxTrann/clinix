import { HANDLE_TEXT } from './request-handle-text';
import { useRequestNotice } from './request-notice-state';

// Thông báo kết quả ở ĐẦU trang danh sách sau khi duyệt hay từ chối xong (reschedule F4 Pha B1): hiện MỘT lần (`request-notice-state.ts`), `role="status"`. Chữ cố định theo danh sách trắng.
const TEXT = {
  DaDuyet: HANDLE_TEXT.doneApproved,
  TuChoi: HANDLE_TEXT.doneRejected,
} as const;

export function RequestNotice() {
  const notice = useRequestNotice();
  if (notice === null) return null;
  return (
    <p
      role="status"
      className="mb-3 rounded-xl border border-success-line bg-success-soft px-3 py-2 text-sm text-success"
    >
      {TEXT[notice]}
    </p>
  );
}
