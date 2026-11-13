import { Info } from 'lucide-react';
import type { BookingConfirmation } from '../../api/booking-types';
import {
  formatVnd,
  isPositiveAmount,
} from '../../appointments/common/appointment-format';
import { DetailRow } from '../../appointments/common/detail-card';
import { refundPolicyLines } from './refund-policy-lines';

// Thẻ "Chi phí" của Bước 5 (booking F5; Figma `451:2`, Q46). QUY TẮC: mọi số tiền là CHUỖI decimal của API qua `formatVnd` NGUYÊN VĂN: không `Number`, không cộng, không trừ ở client.
//  - "Giá dịch vụ" = `giaDichVu`; "Tổng giá khám" = `giaApDung` (đã GỒM phụ phí, hiện đúng số của API);
//  - "Phụ phí bác sĩ" = `phuPhi`, CHỈ để hiển thị và chỉ khi lớn hơn 0 (Figma không có dòng khi bằng 0) [đề xuất];
//  - "Cọc cần thanh toán" = `tienCoc` chỉ khi cọc > 0; "Số dư ví hiện tại" = `soDuVi` chỉ khi KHÁC `null` (`null` không có nghĩa "không đủ tiền");
//  - KHÔNG có số "Còn lại tại quầy" (Figma có nhưng là phép trừ tiền, việc của `payment`, Q20): chỉ giữ câu chữ [đề xuất];
//  - chính sách hoàn (Figma chưa có, nhóm bổ sung) và câu giữ chỗ KHÔNG nêu số phút (số đó là cấu hình `thoi_gian_giu_cho` mà `checks` không trả) [cần điền].
const NOTE_CLASS = 'mt-3 text-sm text-gray-700';

export function CostCard({ data }: { data: BookingConfirmation }) {
  const hasDeposit = isPositiveAmount(data.tienCoc);
  const refundLines = refundPolicyLines(data.chinhSachHoan);
  return (
    <section
      aria-labelledby="confirm-cost-title"
      className="self-start rounded-2xl border border-gray-200 bg-white p-5"
    >
      <h2 id="confirm-cost-title" className="font-semibold text-gray-900">
        Chi phí
      </h2>
      <dl className="mt-1">
        <DetailRow label="Giá dịch vụ">{formatVnd(data.giaDichVu)}</DetailRow>
        {isPositiveAmount(data.phuPhi) && (
          <DetailRow label="Phụ phí bác sĩ">{formatVnd(data.phuPhi)}</DetailRow>
        )}
        <DetailRow label="Tổng giá khám">
          <strong className="font-bold">{formatVnd(data.giaApDung)}</strong>
        </DetailRow>
        {hasDeposit && (
          <DetailRow label="Cọc cần thanh toán">
            <span className="text-warning">{formatVnd(data.tienCoc)}</span>
          </DetailRow>
        )}
        {data.soDuVi !== null && (
          <DetailRow label="Số dư ví hiện tại">
            <span className="text-success">{formatVnd(data.soDuVi)}</span>
          </DetailRow>
        )}
      </dl>

      {refundLines !== null && (
        <div className="mt-3">
          <h3 className="text-sm font-semibold text-gray-900">
            Chính sách hoàn cọc khi hủy lịch
          </h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700">
            {refundLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <p className={NOTE_CLASS}>
        Phần còn lại thanh toán tại quầy trước khi tiếp đón.
      </p>
      {hasDeposit && (
        <>
          <p className="mt-3 flex gap-2 text-sm text-gray-700">
            <Info
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-gray-600"
            />
            Khi bấm xác nhận, khung giờ được giữ chỗ trong thời gian có hạn để
            bạn hoàn tất cọc.
          </p>
          <p className={NOTE_CLASS}>
            Chính sách cọc là giá trị đề xuất mô phỏng, chưa phải quy định chính
            thức của CLINIX.
          </p>
        </>
      )}
    </section>
  );
}
