import type { FieldError } from '../../common/errors/app.exception.js';
import {
  CHAT_CONTENT_MAX_CODE_POINTS,
  CHAT_FIELD_ERRORS,
} from '../chat.constants.js';

// Luật nội dung và mã gửi (chat B1; PLAN chat 5.5, Q17). Hàm THUẦN: không DB, không đồng hồ; REST và socket cùng gọi qua lõi gửi.

// Ký tự điều khiển (Unicode Cc) trừ `\n` và `\t`. `\r` đã được đổi thành `\n` trước khi kiểm.
const FORBIDDEN_CONTROL = /[^\P{Cc}\n\t]/u;
// UUID dạng chuẩn 8-4-4-4-12 chữ số hex (mọi phiên bản); client sinh bằng `crypto.randomUUID()`
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Chuẩn hoá nội dung trước khi kiểm và lưu: `CRLF`, `CR` thành `LF`; chuẩn hoá Unicode NFC; cắt khoảng trắng (kể cả xuống dòng) ở hai đầu. Xuống dòng ở giữa giữ nguyên. */
export function normalizeContent(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').normalize('NFC').trim();
}

/** Số điểm mã (emoji ngoài BMP như 😀 là MỘT, không phải hai đơn vị UTF-16). */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

/**
 * Mã lỗi của nội dung ĐÃ chuẩn hoá, hoặc `null` nếu hợp lệ. `hasFile`: tin có tệp được phép không có chữ (chat B4, TEP-13).
 * Không đụng HTML: lưu nguyên văn, web hiển thị dạng chữ (PLAN 5.11).
 */
export function contentError(
  normalized: string,
  hasFile = false,
): string | null {
  if (normalized.length === 0)
    return hasFile ? null : CHAT_FIELD_ERRORS.CONTENT_EMPTY;
  if (FORBIDDEN_CONTROL.test(normalized))
    return CHAT_FIELD_ERRORS.CONTENT_BAD_CHARACTER;
  if (codePointLength(normalized) > CHAT_CONTENT_MAX_CODE_POINTS)
    return CHAT_FIELD_ERRORS.CONTENT_TOO_LONG;
  return null;
}

/** Mã gửi hợp lệ thì trả về dạng chữ thường (cùng một ý định gửi luôn cùng một chuỗi), ngược lại `null`. */
export function normalizeSendId(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value)
    ? value.toLowerCase()
    : null;
}

export type CheckedInput =
  | { ok: true; noiDung: string; maGui: string }
  | { ok: false; loi: FieldError[] };

/**
 * Kiểm cả hai trường một lượt (trả MỌI lỗi, không dừng ở lỗi đầu) như `ValidationPipe`. Nhận `unknown` vì socket (B5) không qua DTO.
 * `hasFile` (chat B4): tin có tệp được để trống chữ, kể cả không gửi trường `noiDung` (multipart chỉ có tệp); tin không tệp vẫn bắt buộc có chữ (LOI-03).
 */
export function checkSendInput(
  noiDung: unknown,
  maGui: unknown,
  hasFile = false,
): CheckedInput {
  const loi: FieldError[] = [];
  const normalized =
    typeof noiDung === 'string'
      ? normalizeContent(noiDung)
      : noiDung === undefined && hasFile
        ? ''
        : null;
  const contentCode =
    normalized === null
      ? CHAT_FIELD_ERRORS.CONTENT_EMPTY
      : contentError(normalized, hasFile);
  if (contentCode !== null) loi.push({ truong: 'noiDung', ma: contentCode });
  const sendId = normalizeSendId(maGui);
  if (sendId === null)
    loi.push({ truong: 'maGui', ma: CHAT_FIELD_ERRORS.SEND_ID_INVALID });
  if (loi.length > 0 || normalized === null || sendId === null)
    return { ok: false, loi };
  return { ok: true, noiDung: normalized, maGui: sendId };
}
