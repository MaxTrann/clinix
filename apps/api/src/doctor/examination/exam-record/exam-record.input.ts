import type { FieldError } from '../../../common/errors/app.exception.js';
import { redactText } from '../../../common/logging/sanitize.js';
import {
  EXAM_FIELD_ERROR_CODES,
  EXAM_TEXT_MAX_LENGTH,
} from '../examination.constants.js';
import {
  isCalendarDate,
  normalizeText,
  type ValidExamRecord,
} from './exam-record.rules.js';

// Kiểm dữ liệu vào của `PUT exam-record`, HÀM THUẦN (doctor-exam B2; PLAN 5.2, 5.5 bước 1; HSK-05…HSK-08, HSK-16, HSK-23): chạy TRƯỚC mọi truy cập DB và TRƯỚC giao dịch. DTO chỉ kiểm KIỂU (X1 M9),
// mọi mã `BAT_BUOC`, `QUA_DAI`, `NOI_DUNG_KHONG_HOP_LE`, `NGAY_KHONG_HOP_LE` (dạng ngày) do hàm này quyết. Lỗi chỉ có tên trường và mã, KHÔNG có giá trị người dùng (BDK-04).

export type RecordValidation =
  { ok: true; value: ValidExamRecord } | { ok: false; errors: FieldError[] };

type Checked<T> = { value: T } | { ma: string };

/**
 * Một trường chữ: không phải chuỗi hay rỗng sau chuẩn hoá ⇒ `BAT_BUOC`; quá 2.000 đơn vị UTF-16 (`string.length`, như `audit/`) ⇒ `QUA_DAI`; dạng bí mật ⇒ `NOI_DUNG_KHONG_HOP_LE`.
 * "Dạng bí mật" = `redactText` ĐỔI chuỗi, đúng hàm mà `audit/` dùng (một nguồn): nếu không chặn ở đây thì `AuditService.record` ném `AUDIT_SENSITIVE_DATA` ngay trong giao dịch sửa sau Hoàn thành.
 * Áp ở MỌI lần ghi để nội dung ghi được hôm nay không thành không sửa được sau Hoàn thành.
 */
function checkText(raw: unknown): Checked<string> {
  if (typeof raw !== 'string') return { ma: EXAM_FIELD_ERROR_CODES.REQUIRED };
  const value = normalizeText(raw);
  if (value.length === 0) return { ma: EXAM_FIELD_ERROR_CODES.REQUIRED };
  if (value.length > EXAM_TEXT_MAX_LENGTH)
    return { ma: EXAM_FIELD_ERROR_CODES.TOO_LONG };
  if (redactText(value) !== value)
    return { ma: EXAM_FIELD_ERROR_CODES.CONTENT_REJECTED };
  return { value };
}

/** Ngày tái khám: vắng, `null` hay chỉ khoảng trắng ⇒ `null`; còn lại phải là ngày có thật (so với ngày khám ở `checkFollowUpDate`, vì cần `thoi_gian`). */
function checkDate(raw: unknown): Checked<string | null> {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw !== 'string')
    return { ma: EXAM_FIELD_ERROR_CODES.INVALID_DATE };
  const value = raw.trim();
  if (value === '') return { value: null };
  return isCalendarDate(value)
    ? { value }
    : { ma: EXAM_FIELD_ERROR_CODES.INVALID_DATE };
}

/** Kiểm cả bốn trường và gom MỌI lỗi (mỗi trường tối đa một lỗi; `truong` là tên trường của thân). */
export function validateRecordInput(body: {
  trieuChung?: unknown;
  chanDoanSoBo?: unknown;
  huongXuLy?: unknown;
  ngayTaiKhamDuKien?: unknown;
}): RecordValidation {
  const trieuChung = checkText(body.trieuChung);
  const chanDoanSoBo = checkText(body.chanDoanSoBo);
  const huongXuLy = checkText(body.huongXuLy);
  const ngay = checkDate(body.ngayTaiKhamDuKien);
  if (
    'value' in trieuChung &&
    'value' in chanDoanSoBo &&
    'value' in huongXuLy &&
    'value' in ngay
  )
    return {
      ok: true,
      value: {
        trieuChung: trieuChung.value,
        chanDoanSoBo: chanDoanSoBo.value,
        huongXuLy: huongXuLy.value,
        ngayTaiKhamDuKien: ngay.value,
      },
    };
  const named: [string, Checked<unknown>][] = [
    ['trieuChung', trieuChung],
    ['chanDoanSoBo', chanDoanSoBo],
    ['huongXuLy', huongXuLy],
    ['ngayTaiKhamDuKien', ngay],
  ];
  return {
    ok: false,
    errors: named.flatMap(([truong, result]) =>
      'ma' in result ? [{ truong, ma: result.ma }] : [],
    ),
  };
}
