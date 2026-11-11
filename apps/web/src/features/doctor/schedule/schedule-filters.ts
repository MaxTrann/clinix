import {
  shiftStatusOf,
  type ShiftCode,
  type ShiftStatus,
} from '../../../shared/schedule/shift-labels';
import type { DoctorShift } from '../api/schedule-api';

// Bộ lọc của lịch Bác sĩ (doctor F3; WL-05, Q15). Cả ba lọc ở giao diện trên dữ liệu đã tải: trạng thái là giá trị suy ra (không có ở API),
// còn ca và chi nhánh lọc ở đây để danh sách chi nhánh (`chiNhanhLoc`) và thống kê luôn tính trên cùng một tập đã tải.
export const ALL = 'all';

export interface ScheduleFilters {
  status: ShiftStatus | typeof ALL;
  ca: ShiftCode | typeof ALL;
  // `chiNhanhId` hoặc `ALL`
  chiNhanhId: string;
}

export const NO_FILTERS: ScheduleFilters = {
  status: ALL,
  ca: ALL,
  chiNhanhId: ALL,
};

export function hasActiveFilters(filters: ScheduleFilters): boolean {
  return (
    filters.status !== ALL || filters.ca !== ALL || filters.chiNhanhId !== ALL
  );
}

export function applyFilters(
  shifts: readonly DoctorShift[],
  filters: ScheduleFilters,
): DoctorShift[] {
  return shifts.filter(
    (shift) =>
      (filters.status === ALL ||
        shiftStatusOf(shift.nghiPhep) === filters.status) &&
      (filters.ca === ALL || shift.ca === filters.ca) &&
      (filters.chiNhanhId === ALL ||
        shift.chiNhanh.chiNhanhId === filters.chiNhanhId),
  );
}
