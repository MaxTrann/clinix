import {
  CANCEL_REASON_MAX_LENGTH,
  LEAVE_CANCEL_REASON,
  PATIENT_CANCEL_REASON,
} from '../appointments.constants.js';
import type { CancelInput } from './cancel.types.js';

// Chữ ghi vào `lich_hen.ly_do_huy` theo `reason` (Q27; TRACKING 3.23 B10-C). Hàm THUẦN. DTO của từng route đã kiểm `lyDo` (400 với người dùng); ở đây chỉ là lưới an toàn cho LỖI LẬP TRÌNH
// của người gọi nội bộ: thiếu lý do của Lễ tân hay Quản trị viên, hay lý do quá dài, NÉM `RangeError` (một chuỗi dài hơn 255 sẽ làm câu `UPDATE` lỗi 1406 và hoàn tác cả lần huỷ).

/** `ly_do_huy` của lần huỷ này. Cắt khoảng trắng hai đầu; Bệnh nhân bỏ trống ⇒ hằng; `HeThong` luôn là hằng (không đọc `lyDo`). */
export function resolveCancelReason(input: CancelInput): string {
  switch (input.reason) {
    case 'BacSiNghiPhep':
      return LEAVE_CANCEL_REASON;
    case 'BenhNhanHuy': {
      const text = input.lyDo?.trim() ?? '';
      return text === '' ? PATIENT_CANCEL_REASON : assertLength(text);
    }
    case 'LeTanHuy':
    case 'QtvOverride': {
      const text = input.lyDo.trim();
      if (text === '') throw new RangeError('lyDo là bắt buộc');
      return assertLength(text);
    }
  }
}

function assertLength(text: string): string {
  if (text.length > CANCEL_REASON_MAX_LENGTH)
    throw new RangeError(
      `lyDo dài hơn ${String(CANCEL_REASON_MAX_LENGTH)} ký tự`,
    );
  return text;
}
