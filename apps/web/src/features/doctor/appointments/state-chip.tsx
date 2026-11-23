import {
  isAppointmentState,
  stateLabel,
  type AppointmentState,
} from './appointment-state';

// Màu chip theo token và thang chuẩn của ADR 0004, BẢN CHÉP của `booking/appointments/common/status-chip.tsx` (WHT-10 cấm import; `appointment-state.test.tsx`
// DUX6-19 khoá cùng className). Tương phản chữ trên nền đã đo ở booking (12/11/2026) đều ≥ 4,5:1.
const CHIP_STYLES: Record<AppointmentState, string> = {
  ChoThanhToan: 'border-warning-line bg-warning-soft text-warning',
  DaXacNhan: 'border-blue-200 bg-blue-50 text-blue-700',
  DaTiepDon: 'border-teal-200 bg-teal-50 text-teal-700',
  HoanThanh: 'border-success-line bg-success-soft text-success',
  DaHuy: 'border-gray-200 bg-gray-100 text-gray-700',
  VangMat: 'border-danger-line bg-danger-soft text-danger-strong',
};
const UNKNOWN_CHIP_STYLE = 'border-gray-200 bg-gray-50 text-gray-700';

// Chip trạng thái lịch hẹn: LUÔN có chữ (chấm màu chỉ trang trí, `aria-hidden`), không chỉ dựa vào màu. Mã lạ: chip trung tính, không lộ mã thô.
export function AppointmentStateChip({ status }: { status: string }) {
  const style = isAppointmentState(status)
    ? CHIP_STYLES[status]
    : UNKNOWN_CHIP_STYLE;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${style}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {stateLabel(status)}
    </span>
  );
}
