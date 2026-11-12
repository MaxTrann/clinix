import { Wallet } from 'lucide-react';
import { useId } from 'react';
import {
  formatVietnamTime,
  formatVietnamWeekdayDate,
  formatVnd,
} from '../../common/appointment-format';
import type { PatientAppointmentDetail } from '../api/patient-appointment-types';
import { DetailCard, DetailRow } from '../../common/detail-card';
import { DETAIL_TEXT } from './detail-messages';

// Khối thanh toán của lịch `ChoThanhToan` (Figma `426:2`). KHÔNG đếm ngược (đếm ngược và hết hạn là WZ-10 của F6, Đại duyệt 12/11/2026): chỉ hiện hạn thanh toán
// theo giờ Việt Nam. Nút `Thanh toán` vô hiệu kèm "Chưa được triển khai" (nếp LTN-05) vì `payment` và `wallet` chưa có; không có "Số dư ví" (chưa có số).
function PendingPayment({ deadline }: { deadline: string | null }) {
  const noteId = useId();
  return (
    <div className="mt-3 border-t border-gray-100 pt-4">
      {deadline !== null && (
        <div className="rounded-xl border border-cyan-200 bg-brand-soft px-4 py-2.5 text-center text-cyan-800">
          <p className="text-xs font-medium">{DETAIL_TEXT.payBefore}</p>
          <p className="text-base font-bold">
            <time dateTime={deadline}>
              {formatVietnamTime(deadline)},{' '}
              {formatVietnamWeekdayDate(deadline)}
            </time>
          </p>
        </div>
      )}
      <button
        type="button"
        disabled
        aria-describedby={noteId}
        className="mt-3 min-h-11 w-full cursor-not-allowed rounded-xl border border-gray-200 bg-gray-100 px-5 text-sm font-semibold text-gray-600"
      >
        {DETAIL_TEXT.payButton}
      </button>
      <p id={noteId} className="pt-1.5 text-center text-xs text-gray-600">
        {DETAIL_TEXT.payNotReady}
      </p>
    </div>
  );
}

// Thẻ "Chi phí & Thanh toán". Mọi số tiền là chuỗi decimal của máy chủ qua `formatVnd`; client KHÔNG tính giá trừ cọc hay "còn thu" (H4): "Còn phải thu" chỉ
// hiện khi cổng `payment` trả `thanhToan`. `thanhToan = null` ⇒ "Chưa ghi nhận thanh toán" (không bịa số). `DaHuy` hiện "Thu tại quầy: Không thu" theo trạng thái.
export function DetailCostCard({
  detail,
}: {
  detail: PatientAppointmentDetail;
}) {
  const { thanhToan, hoanTien } = detail;
  return (
    <DetailCard icon={Wallet} title={DETAIL_TEXT.costTitle}>
      <div className="px-5 py-1">
        <dl>
          <DetailRow label={DETAIL_TEXT.price}>
            {formatVnd(detail.giaSnapshot)}
          </DetailRow>
          <DetailRow
            label={DETAIL_TEXT.deposit}
            note={thanhToan === null ? DETAIL_TEXT.noPayment : undefined}
          >
            {formatVnd(detail.tienCoc)}
          </DetailRow>
          {thanhToan !== null && (
            <>
              <DetailRow label={DETAIL_TEXT.paid}>
                {formatVnd(thanhToan.daThu)}
              </DetailRow>
              <DetailRow label={DETAIL_TEXT.remaining}>
                {formatVnd(thanhToan.conPhaiThu)}
              </DetailRow>
            </>
          )}
          {hoanTien !== null && (
            <DetailRow
              label={DETAIL_TEXT.refund}
              note={
                hoanTien.trangThai === 'ThanhCong'
                  ? DETAIL_TEXT.refundDone
                  : DETAIL_TEXT.refundFailed
              }
            >
              {formatVnd(hoanTien.soTien)}
            </DetailRow>
          )}
          {detail.trangThai === 'DaHuy' && (
            <DetailRow label={DETAIL_TEXT.counter}>
              {DETAIL_TEXT.noCollect}
            </DetailRow>
          )}
        </dl>
        {detail.trangThai === 'ChoThanhToan' && (
          <PendingPayment deadline={detail.hanThanhToan} />
        )}
        <p className="pt-2 pb-3 text-xs text-gray-600">
          {DETAIL_TEXT.costNote}
        </p>
      </div>
    </DetailCard>
  );
}
