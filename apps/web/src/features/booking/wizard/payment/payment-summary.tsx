import {
  formatVnd,
  isPositiveAmount,
} from '../../appointments/common/appointment-format';
import { DetailRow } from '../../appointments/common/detail-card';
import type { PatientAppointmentDetail } from '../../appointments/patient/api/patient-appointment-types';
import { DoneDetailsCard } from '../done/done-details-card';
import { PAYMENT_TEXT } from './payment-messages';

// Khung tóm tắt lịch ở Bước Thanh toán (booking F6; TRACKING 3.49 D10). Mọi thứ lấy từ chi tiết `GET /patient/appointments/:maLichHen`, KHÔNG từ URL hay bản nháp (đã xoá):
//  - "Mã lịch hẹn" từ API (backend đã chuẩn hoá hoa thường; L18, Q13);
//  - năm hàng chi tiết dùng lại `DoneDetailsCard` của Bước 6 (dịch vụ, bác sĩ kèm chuyên khoa, chi nhánh, ngày và giờ theo GIỜ VIỆT NAM, người khám);
//  - "Giá khám" = `giaSnapshot` (đã gồm phụ phí, Q46; chi tiết không có số phụ phí nên không có dòng riêng) và "Cọc yêu cầu" = `tienCoc` CHỈ khi lớn hơn 0, qua `formatVnd` NGUYÊN VĂN chuỗi:
//    không `Number`, không cộng trừ ở client (H4). KHÔNG "Đã thu", "Thu tại quầy", "Số dư": số tiền cần trả và số dư là của panel thanh toán (máy chủ tính, WTT-01).
export function PaymentSummary({
  detail,
}: {
  detail: PatientAppointmentDetail;
}) {
  return (
    <div className="min-w-0 space-y-4 lg:self-start">
      <dl className="rounded-2xl border border-gray-200 bg-white p-5">
        <dt className="text-xs font-medium tracking-wide text-gray-600 uppercase">
          {PAYMENT_TEXT.codeLabel}
        </dt>
        <dd className="font-mono text-lg font-bold break-all text-brand-strong">
          {detail.maLichHen}
        </dd>
      </dl>
      <DoneDetailsCard detail={detail} />
      <section
        aria-labelledby="payment-cost-title"
        className="rounded-2xl border border-gray-200 bg-white p-5"
      >
        <h2
          id="payment-cost-title"
          className="text-sm font-semibold tracking-wide text-gray-600 uppercase"
        >
          {PAYMENT_TEXT.costTitle}
        </h2>
        <dl className="mt-1">
          <DetailRow label={PAYMENT_TEXT.price}>
            {formatVnd(detail.giaSnapshot)}
          </DetailRow>
          {isPositiveAmount(detail.tienCoc) && (
            <DetailRow label={PAYMENT_TEXT.deposit}>
              {formatVnd(detail.tienCoc)}
            </DetailRow>
          )}
        </dl>
      </section>
    </div>
  );
}
