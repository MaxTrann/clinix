import {
  hoursKey,
  type BranchWeekdayPair,
} from '../../scheduling/branch-hours/branch-hours.reader.js';
import type {
  BranchDayHours,
  CaLamViec,
} from '../../scheduling/branch-hours/branch-hours.types.js';
import { isoWeekdayOf } from '../../scheduling/branch-hours/time-of-day.js';
import type { LeaveState } from '../../scheduling/leave/leave-overlap.rules.js';
import type { BlockingLeave } from '../../scheduling/leave/leave.reader.js';
import type { DoctorShift } from '../../scheduling/shifts/shift-queries.js';
import { leaveStateForShift, shiftHours } from './schedule-view.rules.js';

// Cách dựng MỘT ca để hiển thị, dùng chung cho Bác sĩ (B7), Admin (B9) và Lễ tân (B8): giờ ca và trạng thái nghỉ chỉ có một nguồn.

export interface DoctorScheduleShift {
  lichLamViecId: string;
  ngay: string;
  ca: CaLamViec;
  chiNhanh: { chiNhanhId: string; ten: string };
  batDau: string | null;
  ketThuc: string | null;
  gioCaKhongCon: boolean;
  nghiPhep: LeaveState | null;
  /** Số lịch hẹn đang có của ca (D14, B17: `ChoThanhToan`, `DaXacNhan`, `DaTiepDon`; Q18). Chỉ số lượng, không tên bệnh nhân (XL-18). */
  soLichHen: number;
}

export interface ShiftViewContext {
  /** Kết quả `countByShifts` theo `lichLamViecId`; ca không có khoá ⇒ 0 (booking trả `0` cho ca không có lịch). */
  activeCounts: Readonly<Record<string, number>>;
  leaves: readonly BlockingLeave[];
  hours: ReadonlyMap<string, BranchDayHours | null>;
}

/** Các cặp (chi nhánh trên ca, thứ) cần tra giờ hoạt động: đưa thẳng cho `BranchHoursReader.loadMany`. */
export function hoursPairsOf(
  shifts: readonly DoctorShift[],
): BranchWeekdayPair[] {
  return shifts.map((s) => ({
    chiNhanhId: s.chiNhanhId,
    thuTrongTuan: isoWeekdayOf(s.ngay),
  }));
}

/** Giờ theo lịch hoạt động HIỆN HÀNH của chi nhánh ghi trên ca; nghỉ phép theo `leaves` của đúng bác sĩ đó. */
export function toShiftView(
  shift: DoctorShift,
  context: ShiftViewContext,
): DoctorScheduleShift {
  const hours =
    context.hours.get(
      hoursKey({
        chiNhanhId: shift.chiNhanhId,
        thuTrongTuan: isoWeekdayOf(shift.ngay),
      }),
    ) ?? null;
  return {
    lichLamViecId: shift.lichLamViecId,
    ngay: shift.ngay,
    ca: shift.ca,
    chiNhanh: { chiNhanhId: shift.chiNhanhId, ten: shift.chiNhanhTen },
    ...shiftHours(shift.ca, hours),
    nghiPhep: leaveStateForShift(context.leaves, shift),
    soLichHen: context.activeCounts[shift.lichLamViecId] ?? 0,
  };
}
