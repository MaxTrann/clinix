import { useEffect, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { patientAppointmentReschedulePath } from '../../../../../shared/routes/booking-paths';
import { BookingNotice } from '../../../wizard/booking-notice';
import { readSlotId } from '../../../wizard/slot-id';
import { DetailPageFrame } from '../../common/detail-frame';
import { RESCHEDULE_TEXT } from './reschedule-text';

// Màn xác nhận đổi lịch (reschedule F1 chỉ dựng ĐÍCH và hợp đồng chuyển; thân thật "cũ → mới", ô lý do, `POST …/reschedule` là việc của reschedule F2). Hợp đồng chuyển cho F2:
// route `PATIENT_APPOINTMENT_RESCHEDULE_CONFIRM_ROUTE`, mã lịch ở đường dẫn, `khungGioId` ở query đọc bằng `readSlotId` (id BIGINT dạng chuỗi; thiếu, rỗng, sai dạng hay lặp khoá ⇒ không hợp lệ),
// không lưu gì ở trình duyệt nên tải lại trang vẫn chạy (nếp WZ-09). Ở F1 trang KHÔNG gọi API và KHÔNG hiện id.
export function RescheduleConfirmPage() {
  const { maLichHen = '' } = useParams();
  const [params] = useSearchParams();
  const khungGioId = readSlotId(params);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const back = (
    <Link
      to={patientAppointmentReschedulePath(maLichHen)}
      className="mt-2 block font-medium underline"
    >
      {RESCHEDULE_TEXT.pickAnother}
    </Link>
  );
  return (
    <DetailPageFrame
      backTo={patientAppointmentReschedulePath(maLichHen)}
      backLabel={RESCHEDULE_TEXT.pickAnother}
      title={RESCHEDULE_TEXT.confirmTitle}
      headingRef={headingRef}
    >
      {khungGioId === null ? (
        <BookingNotice message={RESCHEDULE_TEXT.invalidLink}>
          {back}
        </BookingNotice>
      ) : (
        <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-700">
          <p>{RESCHEDULE_TEXT.confirmNotReady}</p>
          {back}
        </div>
      )}
    </DetailPageFrame>
  );
}
