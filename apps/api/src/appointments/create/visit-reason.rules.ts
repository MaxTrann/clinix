import { trimAsciiWhitespace } from '../../auth/validation/ascii-text.js';

// Luật `lyDoKham` của `POST /booking/appointments` (task B8; PLAN booking Q9, DL-23; TRACKING 3.21 B8-G). Hàm THUẦN: DTO, service và test dùng chung.
//  - KHÔNG bắt buộc (Figma `449:2` ghi "không bắt buộc"): vắng, `null`, rỗng hay chỉ khoảng trắng ⇒ `NULL` (cột `ly_do_kham` TEXT cho phép NULL).
//  - Có nhập: chuẩn hoá NFC rồi cắt khoảng trắng ASCII hai đầu (như họ tên, email, từ khoá `q`; cố ý KHÔNG `String.trim()`, nó cắt cả U+00A0), dài 1 đến 500 ĐIỂM MÃ
//    (không phải đơn vị UTF-16: một emoji là một điểm mã), không ký tự điều khiển; xuống dòng được phép (`\n`, `\r`). 500 là quy tắc service `[đề xuất]` (Figma không có bộ đếm).

export const VISIT_REASON_MAX_LENGTH = 500;

// Ký tự điều khiển (Unicode Cc) TRỪ xuống dòng. Tab cũng bị chặn: lý do khám là văn bản tự do một đoạn, không cần tab. `\p{Cf}` (như ZWJ trong emoji ghép) cố ý KHÔNG bị chặn.
const FORBIDDEN_CONTROL = /[^\P{Cc}\n\r]/u;

/**
 * Chuẩn hoá một giá trị `lyDoKham` đã nhận: chuỗi ⇒ NFC, cắt khoảng trắng ASCII, rỗng ⇒ `null`; `null` và `undefined` ⇒ `null`; mọi kiểu khác (số, mảng, đối tượng) giữ NGUYÊN để
 * `isValidVisitReason` từ chối thành 400 (không âm thầm đổi kiểu sai thành `null`).
 */
export function normalizeVisitReason(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return value;
  const text = trimAsciiWhitespace(value.normalize('NFC'));
  return text === '' ? null : text;
}

/** `value` phải là kết quả của `normalizeVisitReason`. `null` là hợp lệ (không nhập lý do). */
export function isValidVisitReason(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  if (normalizeVisitReason(value) !== value) return false;
  if (FORBIDDEN_CONTROL.test(value)) return false;
  const length = Array.from(value).length;
  return length >= 1 && length <= VISIT_REASON_MAX_LENGTH;
}
