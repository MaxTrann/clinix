import { Check } from 'lucide-react';
import type { RefObject } from 'react';
import type { PatientAppointmentDetail } from '../../appointments/patient/api/patient-appointment-types';
import { DoneCostCard } from './done-cost-card';
import { DoneDetailsCard } from './done-details-card';
import { DONE_TEXT } from './done-messages';

// Phiếu hẹn của lịch `DaXacNhan` (booking F7; Figma `453:2`): thẻ xanh "Đặt lịch thành công" kèm mã lịch hẹn, rồi hai thẻ "Chi tiết lịch hẹn" và "Chi phí" cạnh nhau (từ `lg`;
// xếp dọc ở màn hẹp). `h1` nhận tiêu điểm khi phiếu hiện (`done-panel.tsx`). Mã lịch hẹn lấy từ API, KHÔNG từ URL (backend đã chuẩn hoá hoa thường). Chữ "Lịch hẹn đã được xác nhận" là
// của Figma và đúng vì phiếu chỉ vẽ khi `trangThai = DaXacNhan`; không có câu nào hứa email hay thông báo (B15 chưa làm).
export function DoneReceipt({
  detail,
  headingRef,
}: {
  detail: PatientAppointmentDetail;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <>
      <div className="rounded-2xl border border-success-line bg-success-soft p-6 text-center">
        <span
          aria-hidden="true"
          className="mx-auto flex size-12 items-center justify-center rounded-full bg-success text-white"
        >
          <Check className="size-6" />
        </span>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="pt-3 text-2xl font-bold text-gray-900 outline-none"
        >
          {DONE_TEXT.successTitle}
        </h1>
        <p className="mt-1 text-gray-700">{DONE_TEXT.successNote}</p>
        <dl className="mx-auto mt-4 inline-block rounded-xl border border-success-line bg-white px-6 py-3">
          <dt className="text-xs font-medium tracking-wide text-gray-600 uppercase">
            {DONE_TEXT.codeLabel}
          </dt>
          <dd className="font-mono text-2xl font-bold tracking-widest break-all text-brand-strong">
            {detail.maLichHen}
          </dd>
        </dl>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <DoneDetailsCard detail={detail} />
        <DoneCostCard detail={detail} />
      </div>
    </>
  );
}
