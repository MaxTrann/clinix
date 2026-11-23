import { useRef, type RefObject } from 'react';
import {
  formatShiftHours,
  SHIFT_LABELS,
  SHIFT_STATUS_LABELS,
  shiftStatusOf,
} from '../../../shared/schedule/shift-labels';
import { formatWeekdayDate } from '../../../shared/schedule/week';
import type { DoctorShift } from '../api/schedule-api';
import { doctorAppointmentsHref } from '../appointments/appointment-links';
import { AppointmentsPanel } from '../appointments/appointments-panel';
import { useDoctorShiftAppointments } from '../appointments/use-shift-appointments';
import { ModalFrame } from '../components/modal-frame';
import { STATUS_STYLES } from './status-styles';

export interface ShiftDetailDialogProps {
  shift: DoctorShift;
  // Ô đã mở hộp thoại: nhận lại focus khi đóng
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}

// Hộp "Chi tiết ca làm việc" (Figma `469:2`, WL-06): ngày, ca + giờ, chi nhánh. Từ doctor UX6 (G1) có thêm mục "Lịch hẹn trong ca": MỘT lời gọi
// `GET /doctor/appointments` theo (ngày, ca) khi hộp mở, danh sách theo mốc giờ và tổng theo trạng thái (WL-13 [đề xuất]). Thân hộp là khung cuộn riêng
// để ở màn hẹp hộp không vượt khung nhìn và nút "Đóng" luôn thấy.
export function ShiftDetailDialog({
  shift,
  returnFocusRef,
  onClose,
}: ShiftDetailDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const status = shiftStatusOf(shift.nghiPhep);
  const hours = formatShiftHours(shift.batDau, shift.ketThuc);
  const { state, retry } = useDoctorShiftAppointments(shift.ngay, shift.ca);

  return (
    <ModalFrame
      title="Chi tiết ca làm việc"
      initialFocusRef={closeRef}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
      widthClass="max-w-md"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <span
          className={`inline-block rounded-full border px-3 py-1 text-sm font-medium ${STATUS_STYLES[status].chip}`}
        >
          {SHIFT_STATUS_LABELS[status]}
        </span>
        <dl className="mt-5 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 text-sm">
          <dt className="text-gray-500">Ngày</dt>
          <dd className="text-gray-900">{formatWeekdayDate(shift.ngay)}</dd>
          <dt className="text-gray-500">Ca</dt>
          <dd className="text-gray-900">
            {SHIFT_LABELS[shift.ca]}
            {hours !== null
              ? ` · ${hours.replace('–', ' – ')}`
              : ' · Giờ ca không còn hiệu lực'}
          </dd>
          <dt className="text-gray-500">Chi nhánh</dt>
          <dd className="break-words text-gray-900">{shift.chiNhanh.ten}</dd>
        </dl>
        <AppointmentsPanel
          state={state}
          onRetry={retry}
          seeAllHref={doctorAppointmentsHref({ day: shift.ngay, ca: shift.ca })}
        />
      </div>
      <div className="border-t border-gray-100 px-6 py-4">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="min-h-10 w-full rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
        >
          Đóng
        </button>
      </div>
    </ModalFrame>
  );
}
