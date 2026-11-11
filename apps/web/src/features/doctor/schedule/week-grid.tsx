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

export interface WeekGridProps {
  weekStart: string;
  today: string;
  shifts: readonly DoctorShift[];
  // Nút mở "Chi tiết ca" ghi lại ở đây để hộp thoại trả focus khi đóng
  triggerRef: RefObject<HTMLElement | null>;
  onSelect: (shift: DoctorShift) => void;
}

// Giờ của hàng: giờ ca đầu tiên trong tuần có giờ hợp lệ (giờ có thể khác nhau theo chi nhánh và thứ, giờ riêng từng ô nằm ở hộp "Chi tiết ca").
function rowHours(shifts: readonly DoctorShift[], ca: ShiftCode) {
  for (const shift of shifts) {
    if (shift.ca !== ca) continue;
    const hours = formatShiftHours(shift.batDau, shift.ketThuc);
    if (hours !== null) return hours;
  }
  return null;
}

// Lưới tuần T2–CN × Sáng/Chiều (Figma `466:2`). Ô có ca là nút mở "Chi tiết ca"; ô trống là chữ "Không có ca".
// Không có số "lịch khám" trong ô: chưa có dữ liệu booking (WL-10, Q18), hiện "0 lịch" sẽ sai.
export function WeekGrid({
  weekStart,
  today,
  shifts,
  triggerRef,
  onSelect,
}: WeekGridProps) {
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const byCell = useMemo(
    () => new Map(shifts.map((shift) => [`${shift.ngay}|${shift.ca}`, shift])),
    [shifts],
  );

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
                <span className="mt-0.5 block font-normal text-gray-500">
                  {rowHours(shifts, ca)}
                </span>
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

function ShiftCell({
  shift,
  day,
  triggerRef,
  onSelect,
}: {
  shift: DoctorShift;
  day: string;
  triggerRef: RefObject<HTMLElement | null>;
  onSelect: (shift: DoctorShift) => void;
}) {
  const status = shiftStatusOf(shift.nghiPhep);
  return (
    <button
      type="button"
      aria-label={`${SHIFT_LABELS[shift.ca]}, ${formatWeekdayDate(day)}, ${SHIFT_STATUS_LABELS[status]}`}
      onClick={(event) => {
        triggerRef.current = event.currentTarget;
        onSelect(shift);
      }}
      className={`flex h-full w-full flex-col items-start justify-center gap-1 rounded-lg border px-3 text-left transition-colors ${STATUS_STYLES[status].cell}`}
    >
      <span className="text-sm leading-tight font-semibold">
        {SHIFT_STATUS_LABELS[status]}
      </span>
      <span className="text-xs leading-tight break-words">
        {shift.chiNhanh.ten}
      </span>
    </button>
  );
}
