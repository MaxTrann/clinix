import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { SEARCH_ERROR_CODES } from '../search.constants.js';

// BIGINT có dấu của MySQL: tối đa 9223372036854775807 (19 chữ số).
const MAX_BIGINT = '9223372036854775807';
const ID_PATTERN = /^[1-9]\d{0,18}$/;

/**
 * Id trong đường dẫn phải là số nguyên dương vừa BIGINT; sai dạng ⇒ 404 `KHONG_TIM_THAY` (cùng thân với "không có dòng này"),
 * để không phân biệt được "id sai dạng" với "id không tồn tại". Trả về chuỗi để không mất độ chính xác của bigint.
 */
export function parsePublicId(raw: string): string {
  const fits =
    ID_PATTERN.test(raw) &&
    (raw.length < MAX_BIGINT.length || raw <= MAX_BIGINT);
  if (!fits) throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
  return raw;
}

/**
 * Id dùng để LỌC trong query (ví dụ `chiNhanhId`): khác id đường dẫn, sai dạng ⇒ 400 `BO_LOC_KHONG_HOP_LE` kèm tên trường (PLAN 5.8, Q23);
 * id đúng dạng nhưng không tồn tại thì không lỗi (danh sách rỗng). `undefined` = không lọc. Chuỗi rỗng coi là sai dạng.
 */
export function parseFilterId(
  raw: string | undefined,
  field: string,
): string | null {
  if (raw === undefined) return null;
  const fits =
    ID_PATTERN.test(raw) &&
    (raw.length < MAX_BIGINT.length || raw <= MAX_BIGINT);
  if (fits) return raw;
  throw new AppException(400, SEARCH_ERROR_CODES.INVALID_FILTER, {
    thongBao: 'Bộ lọc không hợp lệ.',
    loi: [{ truong: field, ma: SEARCH_ERROR_CODES.INVALID_FILTER_ID }],
  });
}
