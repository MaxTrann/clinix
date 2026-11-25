import { RECEPTION_RESCHEDULE_TEXT } from '../reschedule/reception-reschedule-text';

// Thông báo MỘT LẦN sau khi Lễ tân đổi lịch hộ xong (reschedule F3; WDO-04): đang ở chi tiết lịch MỚI. Dữ liệu đến từ `location.state` đã qua bộ đọc danh sách trắng của `reschedule-notice-state.ts`; chữ cố
// định, không có chữ của máy chủ. `role="status"` để trình đọc màn hình đọc ngay.
export function ReceptionRescheduleDoneNotice() {
  return (
    <p
      role="status"
      className="rounded-xl border border-cyan-200 bg-brand-soft px-4 py-3 text-sm text-cyan-900"
    >
      {RECEPTION_RESCHEDULE_TEXT.doneNotice}
    </p>
  );
}
