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

// Lưới tháng (Figma `467:2`, WL-04): mỗi ngày của tháng là số ngày + mỗi ca một chip "S · Làm việc" (mở "Chi tiết ca"), hoặc "—" khi không có ca.
// Ngày của tháng liền kề để trống (không số, không chip) và không đếm vào thống kê. Hôm nay là vòng tròn đặc.
export function MonthGrid({
  monthStart,
  today,
  shifts,
  triggerRef,
  onSelect,
}: MonthGridProps) {
  const { weeks } = useMemo(() => monthGrid(monthStart), [monthStart]);
  const byDay = useMemo(() => {
    const map = new Map<string, DoctorShift[]>();
    for (const shift of shifts) {
      map.set(shift.ngay, [...(map.get(shift.ngay) ?? []), shift]);
    }
    return map;
  }, [shifts]);

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
                const dayShifts = [...(byDay.get(day) ?? [])].sort(
                  (a, b) =>
                    SHIFT_ORDER.indexOf(a.ca) - SHIFT_ORDER.indexOf(b.ca),
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
                    {dayShifts.length === 0 ? (
                      <p
                        aria-label="Không có ca"
                        className="mt-1.5 text-center text-gray-300"
                      >
                        —
                      </p>
                    ) : (
                      <ul className="mt-1 flex flex-col gap-1">
                        {dayShifts.map((shift) => {
                          const status = shiftStatusOf(shift.nghiPhep);
                          return (
                            <li key={shift.lichLamViecId}>
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
