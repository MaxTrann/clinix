import {
  appointmentStateLabel,
  isAppointmentState,
  type AppointmentState,
} from './appointment-status';

// Màu chip theo token và thang chuẩn của ADR 0004, KHÔNG chép màu Figma. Tương phản chữ trên nền đã đo 12/11/2026 (WCAG 2.x, quy đổi oklch của
// Tailwind 4.3.3; hex của token khớp ADR): Chờ thanh toán 4,87:1 · Đã xác nhận 6,26:1 · Đã tiếp đón 5,17:1 · Hoàn thành 4,72:1 · Đã hủy 9,37:1 ·
// Vắng mặt 5,88:1 · Chưa xác định 9,87:1; đều ≥ 4,5:1. Màu tham chiếu của Figma `411:2`: Chờ thanh toán cam, Đã xác nhận xanh dương, Hoàn thành xanh lá
// (Đã tiếp đón xanh ngọc, Đã hủy xám theo PLAN 4.4); Vắng mặt chưa có màu trong Figma nên dùng nhóm danger [đề xuất].
const CHIP_STYLES: Record<AppointmentState, string> = {
  ChoThanhToan: 'border-warning-line bg-warning-soft text-warning',
  DaXacNhan: 'border-blue-200 bg-blue-50 text-blue-700',
  DaTiepDon: 'border-teal-200 bg-teal-50 text-teal-700',
  HoanThanh: 'border-success-line bg-success-soft text-success',
  DaHuy: 'border-gray-200 bg-gray-100 text-gray-700',
  VangMat: 'border-danger-line bg-danger-soft text-danger-strong',
};
const UNKNOWN_CHIP_STYLE = 'border-gray-200 bg-gray-50 text-gray-700';

// Chip trạng thái lịch hẹn: LUÔN có chữ (chấm màu chỉ là trang trí, `aria-hidden`), không chỉ dựa vào màu. Mã lạ: chip trung tính, không lộ mã thô.
export function StatusChip({ status }: { status: string }) {
  const style = isAppointmentState(status)
    ? CHIP_STYLES[status]
    : UNKNOWN_CHIP_STYLE;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${style}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {appointmentStateLabel(status)}
    </span>
  );
}
