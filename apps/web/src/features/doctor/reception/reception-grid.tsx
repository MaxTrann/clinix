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
import { sharedRowHours } from '../schedule/week-grid-display';
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

// Giờ ghi ở NHÃN của hai hàng Sáng/Chiều của MỘT bác sĩ (doctor UX9), tính bằng `sharedRowHours` của UX8: chỉ ghi khi mọi ca có giờ hợp lệ trong hàng trùng nhau.
// Hàng lệch giờ thì `null` (nhãn chỉ ghi chữ ca, mỗi ô ghi giờ riêng). Hàng không có ca cũng `null`: KHÔNG mượn giờ của bác sĩ khác, vì giờ ca lấy từ lịch hoạt động
// của chi nhánh THEO THỨ nên bác sĩ khác (nhất là chi nhánh khác của Admin Toàn hệ thống) có thể khác giờ, và nhãn sẽ đổi theo thứ tự bác sĩ API trả về.
function doctorRowHours(
  shifts: readonly ReceptionShift[],
): Record<ShiftCode, string | null> {
  return {
    CaSang: sharedRowHours(shifts, 'CaSang'),
    CaChieu: sharedRowHours(shifts, 'CaChieu'),
  };
}

// Lưới tuần của MỌI bác sĩ trong phạm vi Lễ tân (Figma `486:2`): mỗi bác sĩ một khối "tên · chuyên khoa" với hai hàng Sáng/Chiều × T2…CN.
// Chỉ xem: ô có ca mở ngăn kéo "Chi tiết ca", tiêu đề cột mở ngăn kéo "Chi tiết ngày"; không có "+" hay nút sửa. Ô trống để trống như Figma;
// không có dòng "N lịch hẹn / Chưa có lịch" vì chưa có dữ liệu booking (Q18, WL-10).
// Doctor UX9: giờ chuẩn ghi ở nhãn hàng của TỪNG bác sĩ khi các ca trong hàng trùng giờ (ô không ghi giờ); tuần lệch giờ thì nhãn chỉ ghi chữ ca và MỌI ô có ca ghi giờ riêng.
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
            const rowHours = doctorRowHours(doctor.ca);
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
                          className={`h-14 border-r border-b border-gray-100 p-1 align-middle last:border-r-0 ${
                            day === today ? 'bg-info-surface/60' : ''
                          }`}
                        >
                          {shift ? (
                            <ShiftButton
                              doctor={doctor}
                              shift={shift}
                              showHours={rowHours[ca] === null}
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

// `showHours`: nhãn hàng KHÔNG ghi giờ (hàng lệch giờ) nên ô ghi giờ riêng của ca, nếu ca còn giờ (ca "mồ côi" thì không ghi). Tên truy cập: phần đầu như cũ, thêm CUỐI giờ
// chỉ khi ô đang hiện giờ để chữ nhìn thấy nằm trong tên (WCAG 2.5.3); ô không hiện giờ thì tên y như trước UX9.
function ShiftButton({
  doctor,
  shift,
  showHours,
  triggerRef,
  onSelect,
}: {
  doctor: ReceptionDoctorRow;
  shift: ReceptionShift;
  showHours: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  onSelect: (doctor: ReceptionDoctorRow, shift: ReceptionShift) => void;
}) {
  const status = receptionStatusOf(shift.nghiPhep);
  const hours = showHours
    ? formatShiftHours(shift.batDau, shift.ketThuc)
    : null;
  const name = [
    doctor.hoTen,
    SHIFT_LABELS[shift.ca],
    formatWeekdayDate(shift.ngay),
    RECEPTION_STATUS_LABELS[status],
    hours,
  ]
    .filter((part) => part !== null)
    .join(', ');
  return (
    <button
      type="button"
      aria-label={name}
      onClick={(event) => {
        triggerRef.current = event.currentTarget;
        onSelect(doctor, shift);
      }}
      className={`flex h-full w-full flex-col justify-center gap-0.5 rounded-md border px-2 text-left text-xs font-semibold transition-colors ${STATUS_STYLES[status].cell}`}
    >
      <span>{RECEPTION_STATUS_LABELS[status]}</span>
      {hours !== null && (
        <span className="leading-tight font-normal">{hours}</span>
      )}
    </button>
  );
}
