import type { CreateLeaveInput, LeaveKind } from '../api/leave-api';
import type { ShiftCode } from '../../../shared/schedule/shift-labels';

// Dữ liệu và kiểm tra của form "Yêu cầu nghỉ lịch làm việc" (doctor F4; WN-01, WN-02, WN-03). Server là nơi quyết định cuối (A1, Q19–Q25):
// ở đây chỉ chặn sớm các lỗi hiển nhiên để Bác sĩ không phải chờ một lượt gọi API, và dùng CÙNG câu chữ với `leave-errors.ts`.
export type LeaveField = 'hinhThuc' | 'tuNgay' | 'denNgay' | 'ca' | 'lyDo';
export type LeaveFieldErrors = Partial<Record<LeaveField, string>>;

export interface LeaveFormValues {
  hinhThuc: LeaveKind;
  tuNgay: string;
  denNgay: string;
  ca: ShiftCode | '';
  lyDo: string;
}

export const EMPTY_LEAVE_FORM: LeaveFormValues = {
  hinhThuc: 'CaNgay',
  tuNgay: '',
  denNgay: '',
  ca: '',
  lyDo: '',
};

// Giới hạn lý do (Q25): 2–500 ký tự sau khi cắt khoảng trắng hai đầu; server đếm theo điểm mã sau NFC nên đếm bằng `Array.from`.
export const REASON_MIN = 2;
export const REASON_MAX = 500;

export const FIELD_MESSAGES = {
  dateRequired: 'Vui lòng chọn ngày.',
  datePast: 'Không thể xin nghỉ cho ngày đã qua.',
  dateOrder: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.',
  shiftRequired: 'Vui lòng chọn ca.',
  reason: `Vui lòng nhập lý do (${REASON_MIN}–${REASON_MAX} ký tự).`,
} as const;

export function reasonLength(value: string): number {
  return Array.from(value.normalize('NFC').trim()).length;
}

/** Lỗi theo trường; rỗng = hợp lệ. `today` là hôm nay theo giờ VN (`YYYY-MM-DD`). */
export function validateLeaveForm(
  values: LeaveFormValues,
  today: string,
): LeaveFieldErrors {
  const errors: LeaveFieldErrors = {};
  const single = values.hinhThuc === 'TheoCa';
  if (values.tuNgay === '') errors.tuNgay = FIELD_MESSAGES.dateRequired;
  else if (values.tuNgay < today) errors.tuNgay = FIELD_MESSAGES.datePast;
  if (!single) {
    if (values.denNgay === '') errors.denNgay = FIELD_MESSAGES.dateRequired;
    else if (values.tuNgay !== '' && values.denNgay < values.tuNgay)
      errors.denNgay = FIELD_MESSAGES.dateOrder;
  }
  if (single && values.ca === '') errors.ca = FIELD_MESSAGES.shiftRequired;
  const length = reasonLength(values.lyDo);
  if (length < REASON_MIN || length > REASON_MAX)
    errors.lyDo = FIELD_MESSAGES.reason;
  return errors;
}

/** Thân gửi lên: `TheoCa` một ngày (`denNgay = tuNgay`) kèm ca; `CaNgay` không có `ca`. Lý do gửi nguyên văn đã cắt hai đầu. */
export function toCreateInput(values: LeaveFormValues): CreateLeaveInput {
  const lyDo = values.lyDo.trim();
  if (values.hinhThuc === 'TheoCa') {
    return {
      hinhThuc: 'TheoCa',
      tuNgay: values.tuNgay,
      denNgay: values.tuNgay,
      ca: values.ca as ShiftCode,
      lyDo,
    };
  }
  return {
    hinhThuc: 'CaNgay',
    tuNgay: values.tuNgay,
    denNgay: values.denNgay,
    lyDo,
  };
}
