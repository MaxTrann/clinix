import { useMemo, type RefObject } from 'react';
import { Calendar } from 'lucide-react';
import {
  formatShiftHours,
  SHIFT_LABELS,
  SHIFT_ORDER,
  SHIFT_SHORT_LABELS,
  SHIFT_STATUS_LABELS,
  shiftStatusOf,
  type ShiftCode,
} from '../../../shared/schedule/shift-labels';
import {
  formatDayMonth,
  formatWeekdayDate,
  weekdayLabel,
  weekDays,
} from '../../../shared/schedule/week';
import type { DoctorShift } from '../api/schedule-api';
import { STATUS_STYLES } from './status-styles';
import { hasManyBranches, sharedRowHours } from './week-grid-display';

export interface WeekGridProps {
  weekStart: string;
  today: string;
  shifts: readonly DoctorShift[];
  // `chiNhanhLoc` của kỳ đang xem: từ 2 chi nhánh thì ô ghi tên chi nhánh (UX8)
  branches: readonly { chiNhanhId: string }[];
  // Nút mở "Chi tiết ca" ghi lại ở đây để hộp thoại trả focus khi đóng
  triggerRef: RefObject<HTMLElement | null>;
  onSelect: (shift: DoctorShift) => void;
}

// Lưới tuần T2–CN × Sáng/Chiều (Figma `466:2`). Ô có ca là nút mở "Chi tiết ca"; ô trống là chữ "Không có ca".
// Từ doctor UX6 (G1b) ô có "N chưa khám" từ `soLichHen` CÓ SẴN của API lịch (booking B17; 0 lời gọi thêm). `soLichHen` chỉ đếm lịch chưa khám xong,
// nên nhãn là "chưa khám" (Đại chọn 23/11/2026); API cũ không có trường thì KHÔNG hiện số (không bao giờ hiện "0" giả).
// Doctor UX8 gọn ô: giờ chuẩn ghi ở NHÃN HÀNG khi mọi ca có giờ trong hàng trùng giờ (ô không ghi giờ); tuần lệch giờ thì nhãn chỉ ghi chữ ca và MỌI ô ghi giờ riêng.
// Tên chi nhánh chỉ ở ô khi bác sĩ làm từ 2 chi nhánh (`branches`); một chi nhánh thì đầu trang đã ghi.
export function WeekGrid({
  weekStart,
  today,
  shifts,
  branches,
  triggerRef,
  onSelect,
}: WeekGridProps) {
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const byCell = useMemo(
    () => new Map(shifts.map((shift) => [`${shift.ngay}|${shift.ca}`, shift])),
    [shifts],
  );
  const rowHours = useMemo<Record<ShiftCode, string | null>>(
    () => ({
      CaSang: sharedRowHours(shifts, 'CaSang'),
      CaChieu: sharedRowHours(shifts, 'CaChieu'),
    }),
    [shifts],
  );
  const showBranch = hasManyBranches(branches);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[56rem] table-fixed border-collapse text-sm">
        <caption className="sr-only">Lịch làm việc theo tuần</caption>
        <thead>
          <tr>
            <td className="w-24 border-r border-b border-gray-200 bg-gray-50" />
            {days.map((day) => {
              const isToday = day === today;
              return (
                <th
                  key={day}
                  scope="col"
                  className={`border-b border-gray-200 px-2 py-3 text-center font-normal ${
                    isToday
                      ? 'bg-info-surface text-brand-strong'
                      : 'bg-gray-50 text-gray-600'
                  }`}
                >
                  <span className="block text-xs">{weekdayLabel(day)}</span>
                  <span className="block text-base font-semibold text-gray-900">
                    {formatDayMonth(day)}
                  </span>
                  {isToday && (
                    <span className="mt-1 inline-block rounded-full bg-brand-strong px-2 py-0.5 text-[0.6875rem] font-semibold text-white">
                      Hôm nay
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {SHIFT_ORDER.map((ca) => (
            <tr key={ca}>
              <th
                scope="row"
                className="border-r border-b border-gray-200 bg-gray-50 px-2 py-3 text-center text-xs font-semibold text-gray-900"
              >
                {SHIFT_SHORT_LABELS[ca]}
                {rowHours[ca] !== null && (
                  <span className="mt-0.5 block font-normal text-gray-500">
                    {rowHours[ca]}
                  </span>
                )}
              </th>
              {days.map((day) => {
                const shift = byCell.get(`${day}|${ca}`);
                return (
                  <td
                    key={day}
                    className="h-28 border-b border-gray-100 p-1.5 align-top"
                  >
                    {shift ? (
                      <ShiftCell
                        shift={shift}
                        day={day}
                        showHours={rowHours[ca] === null}
                        showBranch={showBranch}
                        triggerRef={triggerRef}
                        onSelect={onSelect}
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-1 rounded-lg bg-gray-50 text-xs text-gray-500">
                        <Calendar aria-hidden="true" className="size-4" />
                        Không có ca
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// `showHours`: nhãn hàng KHÔNG ghi giờ (tuần lệch giờ) nên ô ghi giờ riêng của nó. `showBranch`: bác sĩ làm từ 2 chi nhánh.
// Tên truy cập: phần đầu như cũ, thêm CUỐI chỉ phần đang hiện ở ô (giờ rồi chi nhánh) để chữ nhìn thấy nằm trong tên (WCAG 2.5.3).
function ShiftCell({
  shift,
  day,
  showHours,
  showBranch,
  triggerRef,
  onSelect,
}: {
  shift: DoctorShift;
  day: string;
  showHours: boolean;
  showBranch: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  onSelect: (shift: DoctorShift) => void;
}) {
  const status = shiftStatusOf(shift.nghiPhep);
  const hours = showHours
    ? formatShiftHours(shift.batDau, shift.ketThuc)
    : null;
  const branch = showBranch ? shift.chiNhanh.ten : null;
  const pending =
    shift.soLichHen === undefined ? null : `${shift.soLichHen} chưa khám`;
  const name = [
    SHIFT_LABELS[shift.ca],
    formatWeekdayDate(day),
    SHIFT_STATUS_LABELS[status],
    pending,
    hours,
    branch,
  ]
    .filter((part) => part !== null)
    .join(', ');
  return (
    <button
      type="button"
      aria-label={name}
      onClick={(event) => {
        triggerRef.current = event.currentTarget;
        onSelect(shift);
      }}
      className={`flex min-h-full w-full flex-col items-start justify-center gap-1 rounded-lg border px-3 py-1.5 text-left transition-colors ${STATUS_STYLES[status].cell}`}
    >
      <span className="text-sm leading-tight font-semibold">
        {SHIFT_STATUS_LABELS[status]}
      </span>
      {branch !== null && (
        <span className="text-xs leading-tight break-words">{branch}</span>
      )}
      {hours !== null && <span className="text-xs leading-tight">{hours}</span>}
      {pending !== null && (
        <span className="text-xs leading-tight font-medium">{pending}</span>
      )}
    </button>
  );
}
