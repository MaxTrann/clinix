import { useMemo, type RefObject } from 'react';
import {
  SHIFT_LABELS,
  SHIFT_ORDER,
  SHIFT_STATUS_LABELS,
  shiftStatusOf,
} from '../../../shared/schedule/shift-labels';
import { isInMonth, monthGrid } from '../../../shared/schedule/month';
import { formatWeekdayDate, weekdayLabel } from '../../../shared/schedule/week';
import type { DoctorShift } from '../api/schedule-api';
import { STATUS_STYLES } from './status-styles';

export interface MonthGridProps {
  monthStart: string;
  today: string;
  shifts: readonly DoctorShift[];
  triggerRef: RefObject<HTMLElement | null>;
  onSelect: (shift: DoctorShift) => void;
}

// Chữ cái đầu của ca trong chip: "S" (sáng), "C" (chiều), như Figma `467:2`
const SHIFT_INITIAL = { CaSang: 'S', CaChieu: 'C' } as const;

// Chỗ giữ chỗ của một ca không có (không phân công, hoặc bị bộ lọc loại): cùng cỡ chữ, đệm và viền với chip nên cao đúng bằng chip, chỉ không thấy và không đọc được.
const SLOT_PLACEHOLDER =
  'invisible block rounded border border-transparent px-1.5 py-0.5 text-xs';

// Lưới tháng (Figma `467:2`, WL-04): mỗi ngày là số ngày + mỗi ca một chip "S · Làm việc" (mở "Chi tiết ca"), hoặc "—" khi không có ca nào.
// Mỗi ngày có ca giữ HAI chỗ cố định theo thứ tự ca (sáng trên, chiều dưới): ca bị lọc mất để lại chỗ trống chứ không dồn lên, nên chip ca chiều không nhảy
// lên chỗ ca sáng khi lọc (doctor UX3, G3). Lưới tuần vốn đã giữ hàng Sáng và Chiều. Mỗi (bác sĩ, ngày, ca) có tối đa một ca (UNIQUE ở DB).
// Ngày của tháng liền kề để trống (không số, không chip) và không đếm vào thống kê. Hôm nay là vòng tròn đặc.
export function MonthGrid({
  monthStart,
  today,
  shifts,
  triggerRef,
  onSelect,
}: MonthGridProps) {
  const { weeks } = useMemo(() => monthGrid(monthStart), [monthStart]);
  const byCell = useMemo(
    () => new Map(shifts.map((shift) => [`${shift.ngay}|${shift.ca}`, shift])),
    [shifts],
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[44rem] table-fixed border-collapse text-sm">
        <caption className="sr-only">Lịch làm việc theo tháng</caption>
        <thead>
          <tr>
            {weeks[0].map((day) => (
              <th
                key={day}
                scope="col"
                className="border-b border-gray-200 bg-gray-50 py-2.5 text-center text-xs font-medium text-gray-600"
              >
                {weekdayLabel(day)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((day) => {
                if (!isInMonth(day, monthStart)) {
                  return (
                    <td
                      key={day}
                      className="h-24 border-r border-b border-gray-100 bg-gray-50/60 last:border-r-0"
                    />
                  );
                }
                const isToday = day === today;
                const hasShift = SHIFT_ORDER.some((ca) =>
                  byCell.has(`${day}|${ca}`),
                );
                return (
                  <td
                    key={day}
                    className={`h-24 border-r border-b border-gray-100 p-1.5 align-top last:border-r-0 ${
                      isToday ? 'bg-info-surface' : ''
                    }`}
                  >
                    <span
                      className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                        isToday ? 'bg-brand-strong text-white' : 'text-gray-900'
                      }`}
                    >
                      {Number(day.slice(8, 10))}
                      {isToday && <span className="sr-only"> (hôm nay)</span>}
                    </span>
                    {!hasShift ? (
                      <p
                        aria-label="Không có ca"
                        className="mt-1.5 text-center text-gray-300"
                      >
                        —
                      </p>
                    ) : (
                      <ul className="mt-1 flex flex-col gap-1">
                        {SHIFT_ORDER.map((ca) => {
                          const shift = byCell.get(`${day}|${ca}`);
                          if (!shift) {
                            return (
                              <li
                                key={ca}
                                aria-hidden="true"
                                className={SLOT_PLACEHOLDER}
                              >
                                {'\u00a0'}
                              </li>
                            );
                          }
                          const status = shiftStatusOf(shift.nghiPhep);
                          return (
                            <li key={ca}>
                              <button
                                type="button"
                                aria-label={`${SHIFT_LABELS[shift.ca]}, ${formatWeekdayDate(day)}, ${SHIFT_STATUS_LABELS[status]}`}
                                onClick={(event) => {
                                  triggerRef.current = event.currentTarget;
                                  onSelect(shift);
                                }}
                                className={`block w-full truncate rounded border px-1.5 py-0.5 text-left text-xs transition-colors ${STATUS_STYLES[status].cell}`}
                              >
                                {SHIFT_INITIAL[shift.ca]} ·{' '}
                                {SHIFT_STATUS_LABELS[status]}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
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
