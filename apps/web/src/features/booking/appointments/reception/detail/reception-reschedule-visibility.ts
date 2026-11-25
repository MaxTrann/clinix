import type { ReceptionAppointmentDetail } from '../api/reception-appointment-types';

// Hai trạng thái "còn sống" mà một lịch có thể chưa đổi được (chờ thanh toán, đã xác nhận): cùng tập với nút "Đổi lịch" của Bệnh nhân (reschedule F1, Đại chọn 25/11/2026, câu E). Trạng thái khác (đã tiếp đón, hoàn
// thành, đã huỷ, vắng mặt, đã đổi lịch, mã lạ) thì KHÔNG hiện nút. Quy tắc theo trạng thái này chỉ để chọn ẩn hay vô hiệu; QUYỀN đổi vẫn theo cờ `choPhepDoiLich` của máy chủ.
const STILL_ALIVE: readonly string[] = ['ChoThanhToan', 'DaXacNhan'];

export function showsRescheduleAction(
  detail: Pick<ReceptionAppointmentDetail, 'trangThai'>,
): boolean {
  return STILL_ALIVE.includes(detail.trangThai);
}
