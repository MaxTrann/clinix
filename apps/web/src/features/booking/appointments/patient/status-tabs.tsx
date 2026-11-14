import {
  APPOINTMENT_STATES,
  type AppointmentState,
} from '../common/appointment-status';
import type { StatusCounts } from '../common/status-counts';
import { StatusTabs as CommonStatusTabs } from '../common/status-tabs';
import { LIST_TEXT } from './list-messages';

// Thẻ lọc trạng thái có số đếm của "Lịch hẹn của tôi" (Figma `411:2`): lớp mỏng trên `common/status-tabs.tsx` (chuyển lên ở F11, Bác sĩ dùng chung); giữ tên và props cũ để chỗ dùng không đổi.
// Thứ tự chip là thứ tự của `APPOINTMENT_STATES` (Figma `411:2`).
export function StatusTabs(props: {
  counts: StatusCounts;
  selected: AppointmentState | null;
  onSelect: (status: AppointmentState | null) => void;
}) {
  return (
    <CommonStatusTabs
      {...props}
      states={APPOINTMENT_STATES}
      groupLabel={LIST_TEXT.statusGroup}
      allLabel={LIST_TEXT.allStatuses}
    />
  );
}
