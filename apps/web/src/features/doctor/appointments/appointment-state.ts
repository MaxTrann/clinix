// Sáu trạng thái lịch hẹn mà Bác sĩ và Lễ tân thấy, cùng nhãn tiếng Việt (doctor UX6). ĐÂY LÀ BẢN CHÉP của `features/booking/appointments/common/appointment-status.ts`:
// luật WHT-10 (`features/doctor/architecture.test.ts`) cấm `features/doctor` import `features/booking`. `appointment-state.test.tsx` (DUX6-18, DUX6-19) khoá hai bản
// không lệch nhau. `DaDoiLich` không có ở đây: backend ẩn khỏi danh sách (PLAN booking Q31).
export const APPOINTMENT_STATES = [
  'ChoThanhToan',
  'DaXacNhan',
  'DaTiepDon',
  'HoanThanh',
  'DaHuy',
  'VangMat',
] as const;

export type AppointmentState = (typeof APPOINTMENT_STATES)[number];

export const APPOINTMENT_STATE_LABELS: Readonly<
  Record<AppointmentState, string>
> = {
  ChoThanhToan: 'Chờ thanh toán',
  DaXacNhan: 'Đã xác nhận',
  DaTiepDon: 'Đã tiếp đón',
  HoanThanh: 'Hoàn thành',
  DaHuy: 'Đã hủy',
  VangMat: 'Vắng mặt',
};

// Mã lạ (kể cả `DaDoiLich` nếu backend lỡ trả): nhãn trung tính, không bao giờ để lộ mã thô ra màn hình
export const UNKNOWN_STATE_LABEL = 'Chưa xác định';

export function isAppointmentState(code: string): code is AppointmentState {
  return (APPOINTMENT_STATES as readonly string[]).includes(code);
}

export function stateLabel(code: string): string {
  return isAppointmentState(code)
    ? APPOINTMENT_STATE_LABELS[code]
    : UNKNOWN_STATE_LABEL;
}
