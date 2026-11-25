import { useId } from 'react';
import { Link } from 'react-router';
import { patientAppointmentReschedulePath } from '../../../../../shared/routes/booking-paths';
import type { PatientAppointmentDetail } from '../api/patient-appointment-types';
import { RESCHEDULE_NOT_ALLOWED_MESSAGE } from '../reschedule/reschedule-errors';
import { RESCHEDULE_TEXT } from '../reschedule/reschedule-text';
import { useReschedulePreview } from '../reschedule/use-reschedule-preview';

const BUTTON = 'min-h-11 w-full rounded-xl px-5 text-sm font-medium';

// Liên kết sang trang chọn khung giờ. Nhãn theo `loai` của xem trước (PLAN reschedule 5.12; Đại chọn 25/11/2026, câu A2): hết lần tự đổi ⇒ "Gửi yêu cầu đổi lịch". Trong lúc xem trước chưa về,
// khi nó lỗi hay báo còn lần ⇒ "Đổi lịch" và VẪN bấm được (trang đổi lịch tự gọi lại và tự báo lỗi): lỗi của lời gọi phụ này không làm hỏng chi tiết lịch.
function RescheduleLink({ maLichHen }: { maLichHen: string }) {
  const { state } = useReschedulePreview(maLichHen, null);
  const asRequest = state.status === 'ready' && state.data.loai === 'GuiYeuCau';
  return (
    <Link
      to={patientAppointmentReschedulePath(maLichHen)}
      className={`${BUTTON} flex items-center justify-center border border-brand-strong bg-white text-brand-strong hover:bg-brand-soft`}
    >
      {asRequest ? RESCHEDULE_TEXT.requestButton : RESCHEDULE_TEXT.changeButton}
    </Link>
  );
}

// Nút vô hiệu KÈM LÝ DO bằng chữ (tên mô tả của nút), không chỉ màu hay một tooltip
function DisabledReschedule({ reason }: { reason: string }) {
  const reasonId = useId();
  return (
    <div>
      <button
        type="button"
        disabled
        aria-describedby={reasonId}
        className={`${BUTTON} cursor-not-allowed border border-gray-200 bg-gray-50 text-gray-600`}
      >
        {RESCHEDULE_TEXT.changeButton}
      </button>
      <p id={reasonId} className="mt-2 text-xs text-gray-600">
        {reason}
      </p>
    </div>
  );
}

// Hai trạng thái "còn sống" mà một lịch có thể chưa đổi được (chờ thanh toán, đã quá giờ hẹn, chuỗi quá dài…): hiện nút vô hiệu kèm lý do chung. Trạng thái kết thúc (đã tiếp đón, hoàn thành, đã huỷ,
// vắng mặt, đã đổi lịch, mã lạ) thì ẩn nút như nút Hủy (Đại chọn 25/11/2026, câu E). Quy tắc theo trạng thái này chỉ để chọn ẩn hay vô hiệu; QUYỀN đổi vẫn theo cờ của máy chủ.
const STILL_ALIVE: readonly string[] = ['ChoThanhToan', 'DaXacNhan'];

// Khu đổi lịch ở cột thao tác của chi tiết (reschedule F1, WDH-01). Thứ tự: yêu cầu đang chờ duyệt ⇒ vô hiệu nếu lịch còn sống (thắng cả cờ `choPhepDoiLich`: một lịch chỉ có một yêu cầu chờ;
// lịch đã kết thúc mà còn yêu cầu tồn thì không hiện nút, banner yêu cầu là việc của F2); `choPhepDoiLich` ⇒ liên kết (và MỚI gọi xem trước); còn lại theo trạng thái như trên.
// Web không có bộ luật "đổi được không" thứ hai: mọi quyết định đến từ hai khoá của máy chủ.
export function RescheduleSection({
  detail,
}: {
  detail: PatientAppointmentDetail;
}) {
  const alive = STILL_ALIVE.includes(detail.trangThai);
  if (detail.yeuCauDoiLich?.trangThai === 'ChoDuyet') {
    return alive ? (
      <DisabledReschedule reason={RESCHEDULE_TEXT.pendingReason} />
    ) : null;
  }
  if (detail.choPhepDoiLich) {
    return <RescheduleLink maLichHen={detail.maLichHen} />;
  }
  return alive ? (
    <DisabledReschedule reason={RESCHEDULE_NOT_ALLOWED_MESSAGE} />
  ) : null;
}
