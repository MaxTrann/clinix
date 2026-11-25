import { useId } from 'react';
import { Link } from 'react-router';
import { receptionAppointmentReschedulePath } from '../../../../../shared/routes/booking-paths';
import { RESCHEDULE_NOT_ALLOWED_MESSAGE } from '../../common/reschedule-errors';
import type { ReceptionAppointmentDetail } from '../api/reception-appointment-types';
import { RECEPTION_RESCHEDULE_TEXT } from '../reschedule/reception-reschedule-text';

const BUTTON =
  'inline-flex min-h-11 w-full items-center justify-center rounded-xl border px-3 text-sm font-medium';

// Nút "Đổi lịch hộ" ở thẻ `Thao tác` của chi tiết lịch Lễ tân (reschedule F3, WDO-01). Web KHÔNG có bộ luật "đổi được không" thứ hai: `choPhepDoiLich` do máy chủ quyết. Đổi được ⇒ LIÊN KẾT sang trang chọn khung giờ
// (không gọi API thêm); không ⇒ nút vô hiệu KÈM LÝ DO bằng chữ (tên mô tả của nút), không chỉ màu. `coYeuCauChoDuyet` KHÔNG chặn đổi hộ (KDL-19): chỉ nhắc dưới nút. `busy` (đang gửi thao tác khác hay chi tiết đang tải
// lại): vô hiệu như các nút cũ của thẻ.
export function ReceptionRescheduleAction({
  detail,
  busy,
}: {
  detail: ReceptionAppointmentDetail;
  busy: boolean;
}) {
  const reasonId = useId();
  if (!detail.choPhepDoiLich) {
    return (
      <div>
        <button
          type="button"
          disabled
          aria-describedby={reasonId}
          className={`${BUTTON} cursor-not-allowed border-gray-200 bg-gray-50 text-gray-600`}
        >
          {RECEPTION_RESCHEDULE_TEXT.changeButton}
        </button>
        <p id={reasonId} className="mt-2 text-xs text-gray-600">
          {RESCHEDULE_NOT_ALLOWED_MESSAGE}
        </p>
      </div>
    );
  }
  return (
    <div>
      {busy ? (
        <button
          type="button"
          disabled
          className={`${BUTTON} cursor-not-allowed border-gray-200 bg-gray-50 text-gray-600`}
        >
          {RECEPTION_RESCHEDULE_TEXT.changeButton}
        </button>
      ) : (
        <Link
          to={receptionAppointmentReschedulePath(detail.maLichHen)}
          className={`${BUTTON} border-brand-strong bg-white text-brand-strong hover:bg-brand-soft`}
        >
          {RECEPTION_RESCHEDULE_TEXT.changeButton}
        </Link>
      )}
      {detail.coYeuCauChoDuyet && (
        <p className="mt-2 text-xs text-gray-600">
          {RECEPTION_RESCHEDULE_TEXT.pendingRequest}
        </p>
      )}
    </div>
  );
}
