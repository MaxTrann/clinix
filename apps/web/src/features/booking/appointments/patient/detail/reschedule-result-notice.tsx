import { RESCHEDULE_TEXT } from '../../common/reschedule-text';

// Thông báo MỘT LẦN sau khi gửi đổi lịch (reschedule F2; WDH-05, WDH-41): đã đổi (đang ở chi tiết lịch MỚI) hay đã gửi yêu cầu (đang ở chi tiết lịch CŨ, banner thường trực nằm ngay dưới). Dữ liệu đến từ
// `location.state` đã qua bộ đọc danh sách trắng của `reschedule-notice-state.ts`; chữ cố định, không có chữ của máy chủ.
export function RescheduleResultNotice({
  kind,
}: {
  kind: 'DaDoi' | 'DaGuiYeuCau';
}) {
  return (
    <p
      role="status"
      className="rounded-xl border border-cyan-200 bg-brand-soft px-4 py-3 text-sm text-cyan-900"
    >
      {kind === 'DaDoi'
        ? RESCHEDULE_TEXT.doneNotice
        : RESCHEDULE_TEXT.requestSentNotice}
    </p>
  );
}
