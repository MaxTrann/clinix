import type { FieldError } from '../../../common/errors/app.exception.js';
import { redactText } from '../../../common/logging/sanitize.js';
import { normalizeText } from '../exam-record/exam-record.rules.js';
import {
  EXAM_FIELD_ERROR_CODES,
  HIDE_REASON_MAX_LENGTH,
  HIDE_REASON_MIN_LENGTH,
} from '../examination.constants.js';

// Quy tắc lý do ẩn đánh giá, HÀM THUẦN (doctor-exam B8; PLAN 5.8, 5.14; Q8; KDD-05, KDD-06, KDD-25). Không đọc đồng hồ, không DB. Lỗi chỉ có tên trường và mã, KHÔNG có giá trị người dùng gửi (BDK-04).

export type HideReasonValidation =
  { ok: true; value: string } | { ok: false; errors: FieldError[] };

const fail = (ma: string): HideReasonValidation => ({
  ok: false,
  errors: [{ truong: 'lyDo', ma }],
});

/**
 * Lý do ẩn: chuẩn hoá bằng ĐÚNG `normalizeText` của hồ sơ khám (`CRLF` ⇒ `LF`, bỏ ký tự điều khiển trừ `LF` và `TAB`, surrogate lẻ ⇒ `U+FFFD`, `trim`), rồi đếm bằng `string.length`
 * (đơn vị UTF-16, như `audit-validation.ts` và bộ đếm của web). Thứ tự mã: rỗng (kể cả vắng, `null`, không phải chuỗi) ⇒ `LY_DO_BAT_BUOC`; dưới 10 ⇒ `LY_DO_QUA_NGAN`; trên 255 ⇒ `LY_DO_QUA_DAI`;
 * dạng bí mật ⇒ `NOI_DUNG_KHONG_HOP_LE`. Dạng bí mật = `redactText` ĐỔI chuỗi, đúng hàm mà `audit/` dùng: nếu không chặn ở đây thì `AuditService.record` ném `AUDIT_SENSITIVE_DATA` ngay
 * trong giao dịch và người dùng nhận 500 cho một lỗi đã lường trước (cùng lý do với HSK-23 của B2).
 */
export function validateHideReason(raw: unknown): HideReasonValidation {
  if (typeof raw !== 'string')
    return fail(EXAM_FIELD_ERROR_CODES.HIDE_REASON_REQUIRED);
  const value = normalizeText(raw);
  if (value.length === 0)
    return fail(EXAM_FIELD_ERROR_CODES.HIDE_REASON_REQUIRED);
  if (value.length < HIDE_REASON_MIN_LENGTH)
    return fail(EXAM_FIELD_ERROR_CODES.HIDE_REASON_TOO_SHORT);
  if (value.length > HIDE_REASON_MAX_LENGTH)
    return fail(EXAM_FIELD_ERROR_CODES.HIDE_REASON_TOO_LONG);
  if (redactText(value) !== value)
    return fail(EXAM_FIELD_ERROR_CODES.CONTENT_REJECTED);
  return { ok: true, value };
}
