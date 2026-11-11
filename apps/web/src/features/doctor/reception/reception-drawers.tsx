import { useRef, type ReactNode, type RefObject } from 'react';
import { CalendarDays, Clock } from 'lucide-react';
import {
  formatShiftHours,
  SHIFT_LABELS,
  SHIFT_ORDER,
} from '../../../shared/schedule/shift-labels';
import { formatDate, formatWeekdayDate } from '../../../shared/schedule/week';
import type { ReceptionDoctorRow, ReceptionShift } from '../api/reception-api';
import { ModalFrame } from '../components/modal-frame';
import { STATUS_STYLES } from '../schedule/status-styles';
import {
  NO_SCHEDULE_LABEL,
  RECEPTION_STATUS_LABELS,
  receptionStatusOf,
} from './reception-labels';

interface DrawerProps {
  // Ô hoặc tiêu đề cột đã mở ngăn kéo: nhận lại focus khi đóng
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}

const DRAWER_WIDTH = 'max-w-md';
const DISABLED_ACTION =
  'flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-200 text-sm font-semibold text-gray-600';

// Nút dẫn sang "Quản lý lịch hẹn": vô hiệu tới khi `booking` F11 có trang (PLAN F5; Figma `499:2`, `500:2`). Dùng `aria-disabled` thay cho `disabled`
// để trình đọc màn hình vẫn đọc được lý do ("Chưa được triển khai") và phím Tab vẫn dừng ở nút.
function BookingLinkButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      aria-disabled="true"
      title="Chưa được triển khai"
      onClick={(event) => event.preventDefault()}
      className={DISABLED_ACTION}
    >
      <CalendarDays aria-hidden="true" className="size-4" />
      {label}
      <span className="sr-only"> (chưa được triển khai)</span>
    </button>
  );
}

export interface ShiftDrawerProps extends DrawerProps {
  doctor: ReceptionDoctorRow;
  shift: ReceptionShift;
  // Admin Toàn hệ thống: ghi thêm chi nhánh của ca (doctor F6)
  showBranch?: boolean;
  // Hành động thêm ở chân ngăn kéo (Admin: "Gỡ ca", doctor F7)
  actions?: ReactNode;
}

// Ngăn kéo "Chi tiết ca" (Figma `499:2`, WL-08): bác sĩ + chuyên khoa, ngày, ca + giờ, trạng thái. Mục "LỊCH HẸN TRONG CA" của Figma chưa có:
// cần dữ liệu `booking` (Q18, WL-10), nên không hiện danh sách giả hay "0 lịch".
export function ShiftDrawer({
  doctor,
  shift,
  showBranch = false,
  actions,
  returnFocusRef,
  onClose,
}: ShiftDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const status = receptionStatusOf(shift.nghiPhep);
  const hours = formatShiftHours(shift.batDau, shift.ketThuc);
  return (
    <ModalFrame
      title={doctor.hoTen}
      subtitle={doctor.chuyenKhoa.ten}
      initialFocusRef={closeRef}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
      placement="right"
      widthClass={DRAWER_WIDTH}
      showCloseIcon
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-700">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays aria-hidden="true" className="size-4 text-gray-500" />
            {formatDate(shift.ngay)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock aria-hidden="true" className="size-4 text-gray-500" />
            {SHIFT_LABELS[shift.ca]}
            {hours !== null ? ` · ${hours}` : ' · Giờ ca không còn hiệu lực'}
          </span>
        </p>
        <span
          className={`mt-4 inline-block rounded-full border px-3 py-1 text-sm font-medium ${STATUS_STYLES[status].chip}`}
        >
          {RECEPTION_STATUS_LABELS[status]}
        </span>
        {showBranch && shift.chiNhanh && (
          <p className="mt-4 text-sm text-gray-700">
            <span className="text-gray-500">Chi nhánh: </span>
            {shift.chiNhanh.ten}
          </p>
        )}
      </div>
      <div className="border-t border-gray-100 px-6 py-4">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="mb-3 min-h-10 w-full rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
        >
          Đóng
        </button>
        {actions}
        <BookingLinkButton label="Quản lý lịch hẹn" />
      </div>
    </ModalFrame>
  );
}

export interface DayDrawerProps extends DrawerProps {
  day: string;
  rows: readonly ReceptionDoctorRow[];
}

// Ngăn kéo "Chi tiết ngày" (Figma `500:2`): với mỗi ca, mọi bác sĩ của lưới và trạng thái của họ trong ngày ("Không có lịch" khi không có ca).
export function DayDrawer({
  day,
  rows,
  returnFocusRef,
  onClose,
}: DayDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const shiftOf = (doctor: ReceptionDoctorRow, ca: string) =>
    doctor.ca.find((shift) => shift.ngay === day && shift.ca === ca);
  const total = rows.reduce(
    (sum, doctor) => sum + doctor.ca.filter((s) => s.ngay === day).length,
    0,
  );
  return (
    <ModalFrame
      title={formatWeekdayDate(day).replace(/^CN,/, 'Chủ nhật,')}
      subtitle={total === 0 ? 'Không có ca làm việc' : `${total} ca làm việc`}
      subtitleClass="text-gray-500"
      initialFocusRef={closeRef}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
      placement="right"
      widthClass={DRAWER_WIDTH}
      showCloseIcon
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {SHIFT_ORDER.map((ca) => {
          const shifts = rows.flatMap((doctor) =>
            doctor.ca.filter((s) => s.ngay === day && s.ca === ca),
          );
          const hours =
            shifts
              .map((s) => formatShiftHours(s.batDau, s.ketThuc))
              .find((value) => value !== null) ?? '—';
          return (
            <section key={ca} aria-label={SHIFT_LABELS[ca]}>
              <h3 className="bg-gray-50 px-6 py-2 text-xs font-semibold tracking-wide text-gray-700 uppercase">
                {SHIFT_LABELS[ca]} · {hours}
              </h3>
              <ul className="divide-y divide-gray-100">
                {rows.map((doctor) => {
                  const shift = shiftOf(doctor, ca);
                  const status = shift
                    ? receptionStatusOf(shift.nghiPhep)
                    : null;
                  return (
                    <li
                      key={doctor.bacSiId}
                      className={`flex items-center justify-between gap-3 px-6 py-3 ${
                        shift ? '' : 'opacity-60'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">
                          {doctor.hoTen}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {doctor.chuyenKhoa.ten}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${
                          status
                            ? STATUS_STYLES[status].chip
                            : 'border-gray-200 bg-gray-50 text-gray-600'
                        }`}
                      >
                        {status
                          ? RECEPTION_STATUS_LABELS[status]
                          : NO_SCHEDULE_LABEL}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <div className="border-t border-gray-100 px-6 py-4">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="mb-3 min-h-10 w-full rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
        >
          Đóng
        </button>
        <BookingLinkButton label="Xem trong Quản lý lịch hẹn" />
      </div>
    </ModalFrame>
  );
}
