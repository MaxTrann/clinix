// Sáu trạng thái lịch hẹn mà Bệnh nhân thấy và nhãn Việt hoá, MỘT chỗ cho mọi trang lịch hẹn của booking (F1; F2, F8, F10, F11 dùng lại).
// `DaDoiLich` không có ở đây: backend ẩn khỏi danh sách và số đếm của Bệnh nhân (PLAN Q31, LSH-06). Thứ tự là thứ tự thẻ lọc của Figma `411:2`.
export const APPOINTMENT_STATES = [
  'ChoThanhToan',
  'DaXacNhan',
  'DaTiepDon',
  'HoanThanh',
  'DaHuy',
  'VangMat',
] as const;

export type AppointmentState = (typeof APPOINTMENT_STATES)[number];

// Chữ đúng 2.4 và Figma `411:2` (các nhãn `Đã check-in`, `Đã hoàn thành` chỉ có ở Figma Bác sĩ `457:2` và đã được đổi về hai nhãn dưới, PLAN Q33)
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

// Mã lạ (kể cả `DaDoiLich`, nếu backend lỡ trả): hiện nhãn trung tính, không bao giờ để lộ mã thô ra màn hình và không làm vỡ trang
export const UNKNOWN_STATE_LABEL = 'Chưa xác định';

export function isAppointmentState(code: string): code is AppointmentState {
  return (APPOINTMENT_STATES as readonly string[]).includes(code);
}

export function appointmentStateLabel(code: string): string {
  return isAppointmentState(code)
    ? APPOINTMENT_STATE_LABELS[code]
    : UNKNOWN_STATE_LABEL;
}
