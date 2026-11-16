import type { FieldError } from '../../../common/errors/app.exception.js';
import { normalizeText } from '../exam-record/exam-record.rules.js';
import {
  EXAM_FIELD_ERROR_CODES,
  RATING_COMMENT_MAX_LENGTH,
  RATING_MAX,
  RATING_MIN,
} from '../examination.constants.js';

// Quy tắc đánh giá bác sĩ, HÀM THUẦN (doctor-exam B6; PLAN 5.2, 5.7; Q7; DGB-02, DGB-03, DGB-12). Không đọc đồng hồ, không DB. Mọi mã lỗi chỉ có tên trường và mã, KHÔNG có giá trị người dùng gửi.
// B6 không ghi nhật ký nên KHÔNG kiểm "dạng bí mật" của nhận xét (khác B2): nhận xét được lưu nguyên văn sau chuẩn hoá.

/** Đánh giá đã kiểm: số sao nguyên 1 đến 5; nhận xét đã chuẩn hoá hoặc `null` (bỏ trống, chỉ khoảng trắng). */
export interface ValidRating {
  soSao: number;
  nhanXet: string | null;
}

export type RatingValidation =
  { ok: true; value: ValidRating } | { ok: false; errors: FieldError[] };

type Checked<T> = { value: T } | { ma: string };

/**
 * Số sao: vắng hoặc `null` ⇒ `SO_SAO_BAT_BUOC` ("chưa chọn"); còn lại phải là SỐ nguyên trong [1, 5], ngược lại (0, 6, âm, `3.5`, `"3"`, `true`, mảng, đối tượng, `Infinity`) ⇒ `SO_SAO_KHONG_HOP_LE`.
 * `3.5` PHẢI bị chặn ở đây: `so_sao` là `tinyint`, MySQL làm tròn thành 4 và qua CHECK nên DB không bắt được.
 */
function checkStars(raw: unknown): Checked<number> {
  if (raw === undefined || raw === null)
    return { ma: EXAM_FIELD_ERROR_CODES.RATING_REQUIRED };
  if (
    typeof raw !== 'number' ||
    !Number.isInteger(raw) ||
    raw < RATING_MIN ||
    raw > RATING_MAX
  )
    return { ma: EXAM_FIELD_ERROR_CODES.RATING_INVALID };
  return { value: raw };
}

/**
 * Nhận xét (tuỳ chọn, Q7): vắng, `null` hay rỗng sau chuẩn hoá ⇒ `null`; còn lại tối đa 1.000 đơn vị UTF-16 (`string.length`, đếm SAU chuẩn hoá, như bộ đếm của web) nếu không ⇒ `QUA_DAI`.
 * Chuẩn hoá dùng ĐÚNG `normalizeText` của hồ sơ khám (PLAN 5.2: bỏ điều khiển trừ xuống dòng và tab, `CRLF` ⇒ `LF`, surrogate lẻ ⇒ `U+FFFD`, `trim`; giữ emoji).
 */
function checkComment(raw: string | null | undefined): Checked<string | null> {
  if (raw === undefined || raw === null) return { value: null };
  const value = normalizeText(raw);
  if (value === '') return { value: null };
  if (value.length > RATING_COMMENT_MAX_LENGTH)
    return { ma: EXAM_FIELD_ERROR_CODES.TOO_LONG };
  return { value };
}

/** Kiểm cả hai trường và gom MỌI lỗi (mỗi trường tối đa một lỗi; `truong` là tên trường của thân). `nhanXet` không phải chuỗi đã bị DTO chặn trước (`IS_STRING`). */
export function validateRatingInput(body: {
  soSao?: unknown;
  nhanXet?: string | null;
}): RatingValidation {
  const soSao = checkStars(body.soSao);
  const nhanXet = checkComment(body.nhanXet);
  if ('value' in soSao && 'value' in nhanXet)
    return { ok: true, value: { soSao: soSao.value, nhanXet: nhanXet.value } };
  const errors: FieldError[] = [];
  if ('ma' in soSao) errors.push({ truong: 'soSao', ma: soSao.ma });
  if ('ma' in nhanXet) errors.push({ truong: 'nhanXet', ma: nhanXet.ma });
  return { ok: false, errors };
}

/** DGB b1 (TĐK) và Q7: chỉ lịch `HoanThanh` được đánh giá (và `HoanThanh` là trạng thái cuối: không luồng nào đi ra). */
export function canRate(trangThai: string): boolean {
  return trangThai === 'HoanThanh';
}
