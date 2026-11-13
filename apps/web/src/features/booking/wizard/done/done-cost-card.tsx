import {
  formatVnd,
  isPositiveAmount,
} from '../../appointments/common/appointment-format';
import { DetailRow } from '../../appointments/common/detail-card';
import type { PatientAppointmentDetail } from '../../appointments/patient/api/patient-appointment-types';
import { DONE_TEXT } from './done-messages';

// Thẻ "Chi phí" của phiếu (booking F7; Figma `453:2`). QUY TẮC (H4, Q20): mọi số tiền là CHUỖI decimal của API qua `formatVnd` NGUYÊN VĂN: không `Number`, không cộng, không trừ ở client.
//  - "Giá khám" = `giaSnapshot`; "Cọc yêu cầu" (nhãn của F2) = `tienCoc`, CHỈ khi lớn hơn 0;
//  - "Đã thu" và "Thu tại quầy" = `daThu` và `conPhaiThu` của cổng `payment`, CHỈ khi `thanhToan` khác `null`. Figma có "Cọc đã thanh toán -100.000đ" và "Thu tại quầy 200.000đ" nhưng đó là
//    phép trừ (giá trừ cọc) và khẳng định đã thu tiền: khi `thanhToan = null` thì không biết, nên KHÔNG vẽ số nào (chữ "Cọc đã thanh toán" là `[cần điền]` tới khi `payment` có, F6).
//  - Chú thích "Phần còn lại thu tại quầy trước khi tiếp đón" là chữ của Figma, không có số.
export function DoneCostCard({ detail }: { detail: PatientAppointmentDetail }) {
  const { thanhToan } = detail;
  return (
    <section
      aria-labelledby="done-cost-title"
      className="self-start rounded-2xl border border-gray-200 bg-white p-5"
    >
      <h2
        id="done-cost-title"
        className="text-sm font-semibold tracking-wide text-gray-600 uppercase"
      >
        {DONE_TEXT.costTitle}
      </h2>
      <dl className="mt-1">
        <DetailRow label={DONE_TEXT.price}>
          {formatVnd(detail.giaSnapshot)}
        </DetailRow>
        {isPositiveAmount(detail.tienCoc) && (
          <DetailRow label={DONE_TEXT.deposit}>
            {formatVnd(detail.tienCoc)}
          </DetailRow>
        )}
        {thanhToan !== null && (
          <>
            <DetailRow label={DONE_TEXT.paid}>
              {formatVnd(thanhToan.daThu)}
            </DetailRow>
            <DetailRow label={DONE_TEXT.counter}>
              <strong className="font-bold">
                {formatVnd(thanhToan.conPhaiThu)}
              </strong>
            </DetailRow>
          </>
        )}
      </dl>
      <p className="mt-3 text-sm text-gray-600">{DONE_TEXT.counterNote}</p>
    </section>
  );
}
