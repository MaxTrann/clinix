// Nhãn ca và trạng thái hiển thị của lịch làm việc (doctor F2; WL-02). Giá trị khớp API `GET /doctor/schedule`.
export type ShiftCode = 'CaSang' | 'CaChieu';
export type LeaveStateCode = 'DaDuyet' | 'ChoDuyet' | 'TuChoi';

// Trạng thái một ô: "Làm việc" khi không có nghỉ phép gắn với ca; ba trạng thái còn lại là nghỉ phép (B7 chọn DaDuyet > ChoDuyet > TuChoi).
export type ShiftStatus = 'LamViec' | LeaveStateCode;

export const SHIFT_ORDER: readonly ShiftCode[] = ['CaSang', 'CaChieu'];

export const SHIFT_SHORT_LABELS: Record<ShiftCode, string> = {
  CaSang: 'Sáng',
  CaChieu: 'Chiều',
};

export const SHIFT_LABELS: Record<ShiftCode, string> = {
  CaSang: 'Ca sáng',
  CaChieu: 'Ca chiều',
};

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  LamViec: 'Làm việc',
  DaDuyet: 'Nghỉ đã duyệt',
  ChoDuyet: 'Chờ duyệt',
  TuChoi: 'Yêu cầu bị từ chối',
};

// Thứ tự chú giải theo Figma `466:2` (không có "Đã hủy": Bác sĩ không hủy được yêu cầu, Q23).
export const SHIFT_STATUS_ORDER: readonly ShiftStatus[] = [
  'LamViec',
  'DaDuyet',
  'ChoDuyet',
  'TuChoi',
];

export function shiftStatusOf(nghiPhep: LeaveStateCode | null): ShiftStatus {
  return nghiPhep ?? 'LamViec';
}

/** "08:30–11:30"; `null` khi giờ ca không còn xác định (ca "mồ côi", XL-15). */
export function formatShiftHours(
  batDau: string | null,
  ketThuc: string | null,
): string | null {
  return batDau !== null && ketThuc !== null ? `${batDau}–${ketThuc}` : null;
}
