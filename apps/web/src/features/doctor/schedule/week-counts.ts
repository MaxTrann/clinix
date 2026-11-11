import { shiftStatusOf } from '../../../shared/schedule/shift-labels';
import type { DoctorShift } from '../api/schedule-api';

export interface WeekCounts {
  working: number;
  approvedLeave: number;
  pendingLeave: number;
}

/** Thống kê tuần (WL-01). "Ca làm việc" = ca được phân công và KHÔNG nghỉ đã duyệt [đề xuất]; ca có yêu cầu bị từ chối vẫn là ca làm việc. */
export function countWeek(shifts: readonly DoctorShift[]): WeekCounts {
  const counts: WeekCounts = { working: 0, approvedLeave: 0, pendingLeave: 0 };
  for (const shift of shifts) {
    const status = shiftStatusOf(shift.nghiPhep);
    if (status === 'DaDuyet') counts.approvedLeave += 1;
    else counts.working += 1;
    if (status === 'ChoDuyet') counts.pendingLeave += 1;
  }
  return counts;
}
