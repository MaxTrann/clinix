import { trimAsciiWhitespace } from '../../../auth';

// Luật ô lý do của đổi lịch (reschedule F2; hàm thuần). Viết ĐÚNG như `apps/api/src/appointments/reschedule/reschedule-reason.ts` (B5) để thứ web chặn và thứ API chặn là MỘT, không lệch:
//  - Chuẩn hoá NFC TRƯỚC, rồi cắt khoảng trắng ASCII hai đầu (`trimAsciiWhitespace` của auth khớp API: chỉ `[ \t\n\r\f\v]`). Cố ý KHÔNG `String.trim()`: nó còn cắt cả U+00A0 và các khoảng trắng Unicode.
//  - Độ dài tính bằng ĐIỂM MÃ (`Array.from`: một emoji là một), KHÔNG phải đơn vị UTF-16.
//  - Không ký tự điều khiển (Unicode Cc) trừ xuống dòng (`\n`, `\r`); Tab cũng bị chặn. `\p{Cf}` (như ZWJ trong emoji ghép) cố ý KHÔNG bị chặn.
// Giới hạn và ĐƠN VỊ ĐẾM là tham số. Lễ tân đổi hộ (reschedule F3) dùng đơn vị `utf16` vì máy chủ B7 (`RequiredReason`) đếm khác B5: cắt bằng `String.trim()` (cả U+00A0), đếm `length` theo đơn vị
// UTF-16 (một biểu tượng là 2), KHÔNG chuẩn hoá NFC, KHÔNG cấm ký tự điều khiển. Đúng luật của hộp Hủy (`status-reason.ts`, F9); ca WDO-07 khoá hai nơi không lệch nhau.

export interface ReasonLimits {
  min: number;
  max: number;
}

// `codePoint` (mặc định): luật B5 của Bệnh nhân. `utf16`: luật B7 của Lễ tân đổi hộ.
export type ReasonUnit = 'codePoint' | 'utf16';

// Yêu cầu đổi lịch của Bệnh nhân: 5 đến 500 điểm mã (PLAN reschedule Q7 (f); `REQUEST_REASON_MIN_LENGTH`, `REQUEST_REASON_MAX_LENGTH` của B5)
export const REQUEST_REASON_LIMITS: ReasonLimits = { min: 5, max: 500 };

// Lý do của Lễ tân đổi hộ (Q9; `CANCEL_REASON_MAX_LENGTH` = 255 của B7): 1 đến 255 đơn vị UTF-16. Dùng cùng `unit: 'utf16'`.
export const STAFF_REASON_LIMITS: ReasonLimits = { min: 1, max: 255 };

const FORBIDDEN_CONTROL = /[^\P{Cc}\n\r]/u;

export type ReasonError = 'tooShort' | 'tooLong' | 'control';

// `value` là chuỗi ĐÃ chuẩn hoá, đúng thứ gửi cho `POST …/reschedule`. `length` là số điểm mã của chuỗi đã chuẩn hoá (để hiện bộ đếm).
export type ReasonResult =
  | { ok: true; value: string }
  | { ok: false; error: ReasonError; length: number };

export function normalizeRescheduleReason(text: string): string {
  return trimAsciiWhitespace(text.normalize('NFC'));
}

// Độ dài hiện ở bộ đếm dưới ô: số điểm mã của chữ đã chuẩn hoá (`codePoint`), hoặc `length` của chữ đã `trim()` (`utf16`)
export function countReasonLength(
  text: string,
  unit: ReasonUnit = 'codePoint',
): number {
  return unit === 'utf16'
    ? text.trim().length
    : Array.from(normalizeRescheduleReason(text)).length;
}

// Luật B7: `trim()` rồi đếm đơn vị UTF-16; chữ trả về là đúng thứ gửi đi (không NFC)
function checkUtf16Reason(text: string, limits: ReasonLimits): ReasonResult {
  const value = text.trim();
  const length = value.length;
  if (length < limits.min) return { ok: false, error: 'tooShort', length };
  if (length > limits.max) return { ok: false, error: 'tooLong', length };
  return { ok: true, value };
}

export function checkRescheduleReason(
  text: string,
  limits: ReasonLimits,
  unit: ReasonUnit = 'codePoint',
): ReasonResult {
  if (unit === 'utf16') return checkUtf16Reason(text, limits);
  const value = normalizeRescheduleReason(text);
  const length = Array.from(value).length;
  // Ký tự điều khiển báo trước độ dài: người dùng sửa được cả hai, nhưng câu đúng với nguyên nhân gần hơn
  if (FORBIDDEN_CONTROL.test(value)) {
    return { ok: false, error: 'control', length };
  }
  if (length < limits.min) return { ok: false, error: 'tooShort', length };
  if (length > limits.max) return { ok: false, error: 'tooLong', length };
  return { ok: true, value };
}
