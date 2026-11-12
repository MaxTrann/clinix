import type { CancelOutcome } from '../../appointments/cancel/cancel.types.js';
import type {
  AffectedAppointmentRef,
  AffectedByLeaveFilter,
} from '../../appointments/queries/affected-by-leave.query.js';

// Cổng `doctor` dùng để huỷ lịch hẹn bị ảnh hưởng khi duyệt nghỉ phép (PLAN doctor 5.10 B, D5; task B15).
// Production chỉ có MỘT bản thật (`BookingCancellationAdapter`), KHÔNG có `Noop` (Q26: Noop âm thầm "không có gì để huỷ" làm Duyệt sai nghĩa).
// Bản giả chỉ có trong test (thay token bằng `overrideProvider` hoặc dựng service bằng tay).
// B17 sẽ thêm `listAffected` (D13) và `countByShifts` (D14) vào cổng này.

export const APPOINTMENT_CANCELLATION_PORT = Symbol(
  'APPOINTMENT_CANCELLATION_PORT',
);

export interface AppointmentCancellationPort {
  /** D5: lịch `ChoThanhToan`/`DaXacNhan` của bác sĩ trong khoảng nghỉ, có `thoi_gian > now`. Chỉ đọc. */
  findAffected(
    filter: AffectedByLeaveFilter,
  ): Promise<AffectedAppointmentRef[]>;
  /** Huỷ MỘT lịch vì bác sĩ nghỉ phép (`actor: HeThong`); mỗi lần là một giao dịch riêng của `booking`. Idempotent (`AlreadyCancelled`). */
  cancelForLeave(maLichHen: string): Promise<CancelOutcome>;
}
