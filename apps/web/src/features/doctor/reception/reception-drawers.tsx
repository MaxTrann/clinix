import { useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router';
import { CalendarDays, Clock } from 'lucide-react';
import {
  formatShiftHours,
  SHIFT_LABELS,
  SHIFT_ORDER,
} from '../../../shared/schedule/shift-labels';
import { formatDate, formatWeekdayDate } from '../../../shared/schedule/week';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import type { DayAppointments } from '../api/appointments-api';
import type { ReceptionDoctorRow, ReceptionShift } from '../api/reception-api';
import {
  groupDay,
  summarize,
  type DayGroups,
} from '../appointments/appointment-group';
import { receptionAppointmentsHref } from '../appointments/appointment-links';
import { AppointmentsPanel } from '../appointments/appointments-panel';
import {
  useReceptionDayAppointments,
  useReceptionShiftAppointments,
} from '../appointments/use-shift-appointments';
import { ModalFrame } from '../components/modal-frame';
import { STATUS_STYLES } from '../schedule/status-styles';
import {
  NO_SCHEDULE_LABEL,
  RECEPTION_STATUS_LABELS,
  receptionStatusOf,
} from './reception-labels';
import type { LoadState } from './use-reception-data';

interface DrawerProps {
  // Ô hoặc tiêu đề cột đã mở ngăn kéo: nhận lại focus khi đóng
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  // Chỉ Lễ tân (doctor UX6): hiện lịch hẹn và bật nút "Quản lý lịch hẹn". Admin dùng chung ngăn kéo nhưng `GET /reception/appointments` chỉ cho `LeTan`
  // (Admin nhận 403), nên Admin để `false`: không gọi API và nút giữ nguyên vô hiệu.
  withAppointments?: boolean;
}

const DRAWER_WIDTH = 'max-w-md';
const DISABLED_ACTION =
  'flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-200 text-sm font-semibold text-gray-600';
const LINK_ACTION =
  'flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-strong text-sm font-semibold text-white transition-colors hover:bg-cyan-800';

// Nút dẫn sang "Quản lý lịch hẹn" (booking F8; doctor UX6 bật cho Lễ tân). Có `href` ⇒ liên kết thật (react-router `Link`, không tải lại trang);
// không có ⇒ nút vô hiệu như trước (Admin). Vô hiệu dùng `aria-disabled` thay cho `disabled` để trình đọc màn hình vẫn đọc được lý do và Tab vẫn dừng ở nút.
function BookingLinkButton({ label, href }: { label: string; href?: string }) {
  if (href !== undefined)
    return (
      <Link to={href} className={LINK_ACTION}>
        <CalendarDays aria-hidden="true" className="size-4" />
        {label}
      </Link>
    );
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

// Mục "Lịch hẹn trong ca" của Lễ tân: một lời gọi theo (bác sĩ, ngày), tách ca ở web theo giờ (API không có tham số ca).
function ShiftAppointments({
  doctor,
  shift,
}: {
  doctor: ReceptionDoctorRow;
  shift: ReceptionShift;
}) {
  const { state, retry } = useReceptionShiftAppointments(doctor, shift);
  return <AppointmentsPanel state={state} onRetry={retry} />;
}

// Ngăn kéo "Chi tiết ca" (Figma `499:2`, WL-08): bác sĩ + chuyên khoa, ngày, ca + giờ, trạng thái. Từ doctor UX6 (G9) có thêm mục "Lịch hẹn trong ca"
// (giờ, người khám, dịch vụ, trạng thái, tổng theo trạng thái) và nút "Quản lý lịch hẹn" là liên kết kèm ngày của ca và bác sĩ (WL-13 [đề xuất]).
export function ShiftDrawer({
  doctor,
  shift,
  showBranch = false,
  actions,
  withAppointments = false,
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
        {withAppointments && (
          <ShiftAppointments doctor={doctor} shift={shift} />
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
        <BookingLinkButton
          label="Quản lý lịch hẹn"
          href={
            withAppointments
              ? receptionAppointmentsHref({
                  day: shift.ngay,
                  doctorId: doctor.bacSiId,
                })
              : undefined
          }
        />
      </div>
    </ModalFrame>
  );
}

export interface DayDrawerProps extends DrawerProps {
  day: string;
  rows: readonly ReceptionDoctorRow[];
}

// Số lịch từng (bác sĩ, ca) trong ngày: `off` (Admin), đang tải, lỗi, quá nhiều lịch để thống kê, hoặc đã có số
type DayCounts =
  | { kind: 'off' }
  | { kind: 'loading' }
  | { kind: 'error'; error: unknown; retry: () => void }
  | { kind: 'tooMany'; total: number }
  | { kind: 'ready'; groups: DayGroups };

const OFF: DayCounts = { kind: 'off' };

function dayCountsOf(
  state: LoadState<DayAppointments>,
  retry: () => void,
  rows: readonly ReceptionDoctorRow[],
  day: string,
): DayCounts {
  if (state.status === 'loading') return { kind: 'loading' };
  if (state.status === 'error')
    return { kind: 'error', error: state.error, retry };
  if (state.data.truncated) return { kind: 'tooMany', total: state.data.total };
  return {
    kind: 'ready',
    groups: groupDay(
      state.data.lines,
      rows.map((doctor) => ({
        bacSiId: doctor.bacSiId,
        hoTen: doctor.hoTen,
        chuyenKhoa: doctor.chuyenKhoa.ten,
        ca: doctor.ca,
      })),
      day,
    ),
  };
}

// Ngăn kéo "Chi tiết ngày" (Figma `500:2`): với mỗi ca, mọi bác sĩ của lưới và trạng thái của họ trong ngày ("Không có lịch" khi không có ca). Từ doctor UX6
// (G11) Lễ tân thấy thêm số lịch hẹn của từng bác sĩ theo trạng thái ("3 lịch hẹn: 1 Đã xác nhận · …"), MỘT dòng chữ luôn hiện (không dựa vào rê chuột).
export function DayDrawer(props: DayDrawerProps) {
  return props.withAppointments ? (
    <DayDrawerLive {...props} />
  ) : (
    <DayDrawerView {...props} counts={OFF} />
  );
}

function DayDrawerLive(props: DayDrawerProps) {
  const { state, retry } = useReceptionDayAppointments(props.day);
  const counts = useMemo(
    () => dayCountsOf(state, retry, props.rows, props.day),
    [state, retry, props.rows, props.day],
  );
  return <DayDrawerView {...props} counts={counts} />;
}

function DayDrawerView({
  day,
  rows,
  counts,
  withAppointments = false,
  returnFocusRef,
  onClose,
}: DayDrawerProps & { counts: DayCounts }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const shiftOf = (doctor: ReceptionDoctorRow, ca: string) =>
    doctor.ca.find((shift) => shift.ngay === day && shift.ca === ca);
  const total = rows.reduce(
    (sum, doctor) => sum + doctor.ca.filter((s) => s.ngay === day).length,
    0,
  );
  const countText = (doctor: ReceptionDoctorRow, ca: string): string | null => {
    if (counts.kind !== 'ready') return null;
    if (counts.groups.ambiguous.has(doctor.bacSiId)) return '—';
    return summarize(counts.groups.counts.get(`${doctor.bacSiId}|${ca}`) ?? {})
      .text;
  };
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
        {counts.kind === 'loading' && (
          <div className="px-6 pt-3">
            <LoadingState message="Đang tải lịch hẹn trong ngày..." />
          </div>
        )}
        {counts.kind === 'error' && (
          <div className="px-6 pt-3">
            <ErrorState error={counts.error} onRetry={counts.retry} />
          </div>
        )}
        {counts.kind === 'tooMany' && (
          <p className="px-6 pt-3 text-sm text-gray-700">
            Ngày này có {counts.total} lịch hẹn, nhiều hơn mức thống kê được ở
            đây. Xem đầy đủ trong Quản lý lịch hẹn.
          </p>
        )}
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
                  const line = shift ? countText(doctor, ca) : null;
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
                        {line !== null && (
                          <span className="mt-0.5 block text-xs break-words text-gray-700">
                            {line}
                          </span>
                        )}
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
        <BookingLinkButton
          label="Xem trong Quản lý lịch hẹn"
          href={
            withAppointments ? receptionAppointmentsHref({ day }) : undefined
          }
        />
      </div>
    </ModalFrame>
  );
}
