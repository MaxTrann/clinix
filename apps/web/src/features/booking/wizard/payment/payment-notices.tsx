import { Link } from 'react-router';
import {
  BOOKING_PATH,
  PATIENT_APPOINTMENTS_PATH,
} from '../../../../shared/routes/booking-paths';
import { PAYMENT_TEXT } from './payment-messages';

// Thông báo của Bước Thanh toán khi lịch KHÔNG còn thanh toán được (booking F6; TRACKING 3.49 D9): hết hạn (`ChoThanhToan` quá hạn theo giờ máy chủ, job quét chưa chạy) hay đã hủy (`DaHuy`).
// Tiêu đề (h1) do `payment-panel.tsx` vẽ; ở đây là câu, mã lịch hẹn và hai lối đi. KHÔNG nút trả tiền. `checking`: đang tải lại để máy chủ quyết (`role="status"`). Chữ [đề xuất]; màu theo token
// (chữ `gray-900` trên `warning-soft` hay `danger-soft`, tương phản cao). "Chọn giờ khác" về Bước 1 (URL chỉ mang `khungGioId`, chưa dựng được liên kết về Bước 2, 3: TRACKING 3.22 (k)).
export function PaymentEndedNotice({
  kind,
  maLichHen,
  checking,
}: {
  kind: 'expired' | 'cancelled';
  maLichHen: string;
  checking: boolean;
}) {
  const tone =
    kind === 'expired'
      ? 'border-warning-line bg-warning-soft'
      : 'border-danger-line bg-danger-soft';
  return (
    <div className={`mt-4 rounded-2xl border p-6 ${tone}`}>
      <p className="text-gray-900">
        {kind === 'expired'
          ? PAYMENT_TEXT.expiredNote
          : PAYMENT_TEXT.cancelledNote}
      </p>
      <dl className="mt-4">
        <dt className="text-xs font-medium tracking-wide text-gray-700 uppercase">
          {PAYMENT_TEXT.codeLabel}
        </dt>
        <dd className="font-mono text-lg font-semibold break-all text-gray-900">
          {maLichHen}
        </dd>
      </dl>
      {checking && (
        <p role="status" className="mt-3 text-sm font-medium text-gray-800">
          {PAYMENT_TEXT.checking}
        </p>
      )}
      <nav
        aria-label={PAYMENT_TEXT.nextLabel}
        className="mt-5 flex flex-wrap gap-3"
      >
        <Link
          to={BOOKING_PATH}
          className="inline-flex min-h-12 items-center rounded-xl bg-brand-strong px-5 font-semibold text-white"
        >
          {PAYMENT_TEXT.pickAnother}
        </Link>
        <Link
          to={PATIENT_APPOINTMENTS_PATH}
          className="inline-flex min-h-12 items-center rounded-xl border border-gray-500 bg-white px-5 font-semibold text-gray-800"
        >
          {PAYMENT_TEXT.myAppointments}
        </Link>
      </nav>
    </div>
  );
}
