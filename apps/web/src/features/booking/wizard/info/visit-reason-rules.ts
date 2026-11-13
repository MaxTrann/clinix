import { trimAsciiWhitespace } from '../../../auth';

// Luật "Lý do khám" của Bước 4 (booking F4; PLAN Q9; hàm thuần). Viết ĐÚNG như `apps/api/src/appointments/create/visit-reason.rules.ts` để thứ web chặn
// và thứ API chặn là MỘT, không lệch:
//  - KHÔNG bắt buộc: rỗng hay chỉ khoảng trắng ⇒ `null` (không gửi, cột `ly_do_kham` NULL).
//  - Có nhập: chuẩn hoá NFC TRƯỚC, rồi cắt khoảng trắng ASCII hai đầu. Cố ý KHÔNG `String.trim()`: nó còn cắt cả U+00A0 và các khoảng trắng Unicode, khiến web chuẩn
//    hoá khác API (`trimAsciiWhitespace` của auth khớp API: chỉ `[ \t\n\r\f\v]`).
//  - Dài 1 đến 500 ĐIỂM MÃ (`Array.from`: một emoji là một), KHÔNG phải đơn vị UTF-16 như lý do huỷ 255 của F9. 500 là quy tắc service [đề xuất] (Figma không có bộ đếm).
//  - Không ký tự điều khiển (Unicode Cc) trừ xuống dòng (`\n`, `\r`). Tab cũng bị chặn. `\p{Cf}` (như ZWJ trong emoji ghép) cố ý KHÔNG bị chặn.
export const VISIT_REASON_MAX_LENGTH = 500;

const FORBIDDEN_CONTROL = /[^\P{Cc}\n\r]/u;

export type VisitReasonError = 'tooLong' | 'control';

// `value = null`: không nhập (hợp lệ). Ngoài ra `value` là chuỗi ĐÃ chuẩn hoá, đúng thứ gửi cho `POST /booking/appointments` và lưu ở bản nháp.
export type VisitReasonResult =
  { ok: true; value: string | null } | { ok: false; error: VisitReasonError };

// Chuẩn hoá đầu vào của ô nhập: NFC rồi cắt khoảng trắng ASCII; rỗng ⇒ `null`
export function normalizeVisitReason(text: string): string | null {
  const normalized = trimAsciiWhitespace(text.normalize('NFC'));
  return normalized === '' ? null : normalized;
}

export function checkVisitReason(text: string): VisitReasonResult {
  const value = normalizeVisitReason(text);
  if (value === null) return { ok: true, value: null };
  // Ký tự điều khiển báo trước độ dài: người dùng sửa được cả hai, nhưng câu đúng với nguyên nhân gần hơn
  if (FORBIDDEN_CONTROL.test(value)) return { ok: false, error: 'control' };
  if (Array.from(value).length > VISIT_REASON_MAX_LENGTH) {
    return { ok: false, error: 'tooLong' };
  }
  return { ok: true, value };
}

// Chữ lỗi. `tooLong` nguyên văn PLAN 5.14 (`LY_DO_KHAM_KHONG_HOP_LE`); `control` là [đề xuất] vì câu 5.14 nói "tối đa 500 ký tự" nên sai nguyên nhân với ký tự điều khiển.
export const VISIT_REASON_MESSAGES: Record<VisitReasonError, string> = {
  tooLong: 'Lý do khám không hợp lệ (tối đa 500 ký tự).',
  control:
    'Lý do khám có ký tự không được phép (ví dụ phím Tab). Vui lòng xoá ký tự đó.',
};
