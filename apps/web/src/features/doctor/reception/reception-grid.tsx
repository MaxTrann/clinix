import { Fragment, useMemo, type RefObject } from 'react';
import { Stethoscope } from 'lucide-react';
import {
  formatShiftHours,
  SHIFT_LABELS,
  SHIFT_ORDER,
  SHIFT_SHORT_LABELS,
  type ShiftCode,
} from '../../../shared/schedule/shift-labels';
import {
  formatDayMonth,
  formatWeekdayDate,
  weekdayLabel,
  weekDays,
} from '../../../shared/schedule/week';
import type { ReceptionDoctorRow, ReceptionShift } from '../api/reception-api';
import { STATUS_STYLES } from '../schedule/status-styles';
import { RECEPTION_STATUS_LABELS, receptionStatusOf } from './reception-labels';

export interface ReceptionGridProps {
  weekStart: string;
  today: string;
  rows: readonly ReceptionDoctorRow[];
  triggerRef: RefObject<HTMLElement | null>;
  onSelectShift: (doctor: ReceptionDoctorRow, shift: ReceptionShift) => void;
  onSelectDay: (day: string) => void;
  // Admin Toàn hệ thống: ghi chi nhánh HIỆN TẠI của bác sĩ ở bên phải tên (Figma `515:2`)
  showBranch?: boolean;
  // Admin (doctor F7): ô trống có nút "+" mở hộp Phân công điền sẵn bác sĩ/ngày/ca (WA-05); không truyền ⇒ ô trống để trống (Lễ tân)
  onAssignCell?: (
    cell: { bacSiId: string; ngay: string; ca: ShiftCode },
    // Ô đã bấm: hộp Phân công trả focus về đây khi đóng (jsdom/Safari không tự focus nút khi bấm nên không dựa vào activeElement)
    trigger: HTMLElement,
  ) => void;
}

// Nhãn thứ ngắn của Figma `486:2`: "T2" … "T7", "CN"
const shortWeekday = (day: string) => weekdayLabel(day).replace('Thứ ', 'T');

function rowHours(shifts: readonly ReceptionShift[], ca: ShiftCode) {
  for (const shift of shifts) {
    if (shift.ca !== ca) continue;
    const hours = formatShiftHours(shift.batDau, shift.ketThuc);
    if (hours !== null) return hours;
  }
  return null;
}

// Lưới tuần của MỌI bác sĩ trong phạm vi Lễ tân (Figma `486:2`): mỗi bác sĩ một khối "tên · chuyên khoa" với hai hàng Sáng/Chiều × T2…CN.
// Chỉ xem: ô có ca mở ngăn kéo "Chi tiết ca", tiêu đề cột mở ngăn kéo "Chi tiết ngày"; không có "+" hay nút sửa. Ô trống để trống như Figma;
// không có dòng "N lịch hẹn / Chưa có lịch" vì chưa có dữ liệu booking (Q18, WL-10).
export function ReceptionGrid({
  weekStart,
  today,
  rows,
  triggerRef,
  onSelectShift,
  onSelectDay,
  showBranch = false,
  onAssignCell,
}: ReceptionGridProps) {
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  // Giờ hàng lấy từ mọi ca của mọi bác sĩ trong tuần (cùng chi nhánh nên thường trùng nhau)
  const allShifts = useMemo(() => rows.flatMap((row) => row.ca), [rows]);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[56rem] table-fixed border-collapse text-sm">
        <caption className="sr-only">
          Lịch làm việc của các bác sĩ theo tuần
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="w-24 border-r border-b border-gray-200 bg-gray-50 px-2 py-3 text-center text-xs font-semibold text-gray-600"
            >
              CA
            </th>
            {days.map((day) => {
              const isToday = day === today;
              return (
                <th
                  key={day}
                  scope="col"
                  className={`border-b border-gray-200 p-0 font-normal ${
                    isToday ? 'bg-info-surface' : 'bg-gray-50'
                  }`}
                >
                  <button
                    type="button"
                    aria-label={`Chi tiết ngày ${formatWeekdayDate(day)}`}
                    onClick={(event) => {
                      triggerRef.current = event.currentTarget;
                      onSelectDay(day);
                    }}
                    className={`block w-full px-2 py-3 text-center transition-colors hover:bg-black/5 ${
                      isToday ? 'text-brand-strong' : 'text-gray-600'
                    }`}
                  >
                    <span className="block text-xs font-semibold">
                      {shortWeekday(day)}
                    </span>
                    <span className="block text-xs">{formatDayMonth(day)}</span>
                    {isToday && (
                      <span
                        role="img"
                        aria-label="Hôm nay"
                        className="mx-auto mt-1 block size-1.5 rounded-full bg-brand-strong"
                      />
                    )}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((doctor) => {
            const byCell = new Map(
              doctor.ca.map((shift) => [`${shift.ngay}|${shift.ca}`, shift]),
            );
            return (
              <Fragment key={doctor.bacSiId}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={8}
                    className="border-y border-gray-200 bg-gray-50 px-3 py-2.5 text-left font-normal"
                  >
                    <span className="flex items-center gap-2">
                      <Stethoscope
                        aria-hidden="true"
                        className="size-4 text-brand-strong"
                      />
                      <span className="font-semibold text-gray-900">
                        {doctor.hoTen}
                      </span>
                      <span className="text-xs text-brand-strong">
                        {doctor.chuyenKhoa.ten}
                      </span>
                      {doctor.ngungHoatDong && (
                        <span className="rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-600">
                          Ngừng hoạt động
                        </span>
                      )}
                      {showBranch && (
                        <span className="ml-auto text-xs font-normal text-gray-500">
                          {doctor.chiNhanh.ten}
                        </span>
                      )}
                    </span>
                  </th>
                </tr>
                {SHIFT_ORDER.map((ca) => (
                  <tr key={ca}>
                    <th
                      scope="row"
                      className="border-r border-b border-gray-100 px-2 py-2 text-center text-xs font-semibold text-gray-900"
                    >
                      {SHIFT_SHORT_LABELS[ca]}
                      <span className="mt-0.5 block font-normal text-gray-500">
                        {rowHours(doctor.ca, ca) ?? rowHours(allShifts, ca)}
                      </span>
                    </th>
                    {days.map((day) => {
                      const shift = byCell.get(`${day}|${ca}`);
                      return (
                        <td
                          key={day}
                          className={`h-14 border-r border-b border-gray-100 p-1 align-middle last:border-r-0 ${
                            day === today ? 'bg-info-surface/60' : ''
                          }`}
                        >
                          {shift ? (
                            <ShiftButton
                              doctor={doctor}
                              shift={shift}
                              triggerRef={triggerRef}
                              onSelect={onSelectShift}
                            />
                          ) : (
                            onAssignCell && (
                              <button
                                type="button"
                                aria-label={`Phân công ca: ${doctor.hoTen}, ${SHIFT_LABELS[ca]}, ${formatWeekdayDate(day)}`}
                                onClick={(event) => {
                                  triggerRef.current = event.currentTarget;
                                  onAssignCell(
                                    { bacSiId: doctor.bacSiId, ngay: day, ca },
                                    event.currentTarget,
                                  );
                                }}
                                className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-gray-200 text-gray-300 transition-colors hover:border-brand-strong hover:bg-sky-50 hover:text-brand-strong"
                              >
                                +
                              </button>
                            )
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ShiftButton({
  doctor,
  shift,
  triggerRef,
  onSelect,
}: {
  doctor: ReceptionDoctorRow;
  shift: ReceptionShift;
  triggerRef: RefObject<HTMLElement | null>;
  onSelect: (doctor: ReceptionDoctorRow, shift: ReceptionShift) => void;
}) {
  const status = receptionStatusOf(shift.nghiPhep);
  return (
    <button
      type="button"
      aria-label={`${doctor.hoTen}, ${SHIFT_LABELS[shift.ca]}, ${formatWeekdayDate(shift.ngay)}, ${RECEPTION_STATUS_LABELS[status]}`}
      onClick={(event) => {
        triggerRef.current = event.currentTarget;
        onSelect(doctor, shift);
      }}
      className={`flex h-full w-full items-center rounded-md border px-2 text-left text-xs font-semibold transition-colors ${STATUS_STYLES[status].cell}`}
    >
      {RECEPTION_STATUS_LABELS[status]}
    </button>
  );
}
