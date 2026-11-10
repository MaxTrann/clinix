import type {
  BranchDayHours,
  CaLamViec,
} from '../../scheduling/branch-hours/branch-hours.types.js';
import { shiftWindow } from '../../scheduling/branch-hours/shift-window.rules.js';
import { formatHHMM } from '../../scheduling/branch-hours/time-of-day.js';
import {
  formatCalendarDate,
  parseCalendarDate,
} from '../../scheduling/calendar-date.js';
import {
  leaveCoversShift,
  pickBlockingLeave,
  type LeaveState,
} from '../../scheduling/leave/leave-overlap.rules.js';
import type { BlockingLeave } from '../../scheduling/leave/leave.reader.js';

/** Khoảng xem lịch tối đa (tháng 6 tuần), tính cả hai đầu (Q15). */
export const MAX_SCHEDULE_DAYS = 42;

export type ScheduleRangeResult =
  { ok: true; tuNgay: string; denNgay: string } | { ok: false };

/** `tuNgay`, `denNgay` bắt buộc, đúng 'YYYY-MM-DD' có thật, `denNgay >= tuNgay`, tối đa 42 ngày (XL-07). */
export function checkScheduleRange(
  tuNgay: string | undefined,
  denNgay: string | undefined,
): ScheduleRangeResult {
  const from = tuNgay === undefined ? null : parseCalendarDate(tuNgay);
  const to = denNgay === undefined ? null : parseCalendarDate(denNgay);
  if (from === null || to === null || to < from) return { ok: false };
  if (to - from + 1 > MAX_SCHEDULE_DAYS) return { ok: false };
  return {
    ok: true,
    tuNgay: formatCalendarDate(from),
    denNgay: formatCalendarDate(to),
  };
}

/**
 * Trạng thái nghỉ gắn trên một ca (Q16): `DaDuyet` > `ChoDuyet` > `TuChoi` > không có.
 * `TuChoi` chỉ để Bác sĩ thấy "Yêu cầu bị từ chối"; yêu cầu đang chặn luôn thắng yêu cầu bị từ chối.
 */
export function leaveStateForShift(
  leaves: readonly BlockingLeave[],
  shift: { ngay: string; ca: CaLamViec },
): LeaveState | null {
  const covering = leaves.filter((leave) => leaveCoversShift(leave, shift));
  const blocking = pickBlockingLeave(
    covering.filter((leave) => leave.trangThai !== 'TuChoi'),
  );
  if (blocking) return blocking.trangThai;
  return covering.length > 0 ? 'TuChoi' : null;
}

export interface ShiftHours {
  batDau: string | null;
  ketThuc: string | null;
  /** true khi khoảng của ca không còn trong lịch hoạt động hiện hành (ca "mồ côi", Q17). */
  gioCaKhongCon: boolean;
}

/** Giờ ca = khoảng nhận khám HIỆN HÀNH của chi nhánh ghi trên ca; không còn khoảng đó thì `null` kèm cờ (XL-15). */
export function shiftHours(
  ca: CaLamViec,
  ngayHoatDong: BranchDayHours | null,
): ShiftHours {
  const window = shiftWindow(ca, ngayHoatDong);
  return window.ok
    ? {
        batDau: formatHHMM(window.khoang.tuGiay),
        ketThuc: formatHHMM(window.khoang.denGiay),
        gioCaKhongCon: false,
      }
    : { batDau: null, ketThuc: null, gioCaKhongCon: true };
}
