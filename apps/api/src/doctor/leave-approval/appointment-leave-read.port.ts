import type {
  AffectedByLeaveFilter,
  AffectedLeaveSummary,
} from '../../appointments/queries/affected-by-leave.query.js';

// Cổng ĐỌC mà `doctor` dùng để biết hệ quả lên lịch hẹn (PLAN doctor 5.10 B, D13, D14; task B17). Tách khỏi `AppointmentCancellationPort` (D5 + `cancel`, bước 2 của Duyệt):
// bên đọc (chi tiết và danh sách yêu cầu nghỉ, lưới lịch, phản hồi tạo yêu cầu) không cần `cancel`, còn bên huỷ không cần số liệu. Một bản thật duy nhất
// (`BookingCancellationAdapter` thực hiện cả hai), KHÔNG có `Noop` (Q26): hiện "0 lịch" khi chưa nối là hiện sai. Bản giả chỉ có trong test.

export const APPOINTMENT_LEAVE_READ_PORT = Symbol(
  'APPOINTMENT_LEAVE_READ_PORT',
);

export interface AppointmentLeaveReadPort {
  /**
   * D13: số liệu và `limit` dòng đầu của các lịch hẹn bị ảnh hưởng bởi một khoảng nghỉ, CÙNG định nghĩa "bị ảnh hưởng" với `findAffected` (một hàm lọc ở booking).
   * `tong` và `soBenhNhan` không phụ thuộc `limit`; `limit = 0` thì chỉ đếm.
   */
  listAffected(
    input: AffectedByLeaveFilter & { limit: number },
  ): Promise<AffectedLeaveSummary>;
  /** D14: số lịch đang có (`ChoThanhToan`, `DaXacNhan`, `DaTiepDon`) của từng ca; ca không có lịch ⇒ `0`, danh sách rỗng ⇒ `{}`. */
  countByShifts(lichLamViecIds: string[]): Promise<Record<string, number>>;
}
