import type { RefObject } from 'react';
import { Link } from 'react-router';
import { bookingPaymentPath } from '../../../../shared/routes/booking-paths';
import { StatusChip } from '../../appointments/common/status-chip';
import type { PatientAppointmentDetail } from '../../appointments/patient/api/patient-appointment-types';
import { DONE_TEXT } from './done-messages';
import type { NoticeView } from './done-state';

// Thông báo của Bước 6 cho lịch KHÔNG ở `DaXacNhan` (booking F7, TRACKING 3.36 F7-G): đúng trạng thái, không "Đặt lịch thành công", không thẻ chi phí. Figma `453:2` chỉ có trường hợp
// thành công nên chữ là [đề xuất]. `ChoThanhToan` có liên kết "Tiếp tục thanh toán" tới trang Thanh toán của ĐÚNG mã (`maLichHen` của API, đã `encodeURIComponent` ở hàm dựng); mọi trạng
// thái khác đi tiếp bằng nút "Xem lịch hẹn của tôi" ở `done-actions.tsx` (luôn có).
export function DoneStateNotice({
  detail,
  view,
  headingRef,
}: {
  detail: PatientAppointmentDetail;
  view: NoticeView;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <StatusChip status={detail.trangThai} />
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="pt-3 text-2xl font-bold text-gray-900 outline-none"
      >
        {view.title}
      </h1>
      <p className="mt-1 text-gray-700">{view.sentence}</p>
      <dl className="mt-4">
        <dt className="text-xs font-medium tracking-wide text-gray-600 uppercase">
          {DONE_TEXT.codeLabel}
        </dt>
        <dd className="font-mono text-lg font-semibold break-all text-gray-900">
          {detail.maLichHen}
        </dd>
      </dl>
      {view.needsPayment && (
        <Link
          to={bookingPaymentPath(detail.maLichHen)}
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand-strong px-5 font-semibold text-white"
        >
          {DONE_TEXT.payNow}
        </Link>
      )}
    </div>
  );
}
