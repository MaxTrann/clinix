import { CA_LAM_VIEC } from '../../admin/entities/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
import { parseCalendarDate } from '../../scheduling/calendar-date.js';
import type { CaLamViec } from '../../scheduling/branch-hours/branch-hours.types.js';
import { parseFilterId } from '../../search/common/id-param.js';
import {
  SEARCH_ERROR_CODES,
  SLOT_WINDOW_DAYS,
} from '../../search/search.constants.js';
import type { SuggestionQueryDto } from './suggestion.dto.js';
import { SUGGEST_FIELD_CODES } from './suggestion.constants.js';

/** Tham số đã kiểm: id là chuỗi (không mất độ chính xác BIGINT), `null` là "không lọc". */
export interface SuggestionQuery {
  chuyenKhoaId: string;
  chiNhanhId: string | null;
  ngay: string | null;
  ca: CaLamViec | null;
}

type FieldError = { truong: string; ma: string };

// Cùng bộ kiểm id BIGINT dương với bộ lọc của search (một nguồn): `parseFilterId` ném `AppException` khi sai dạng.
function idOrError(
  raw: string | undefined,
  field: string,
  errors: FieldError[],
): string | null {
  try {
    return parseFilterId(raw, field);
  } catch (error) {
    if (error instanceof AppException) {
      errors.push({ truong: field, ma: SEARCH_ERROR_CODES.INVALID_FILTER_ID });
      return null;
    }
    throw error;
  }
}

function dayOrError(
  raw: string | undefined,
  today: string,
  errors: FieldError[],
): string | null {
  if (raw === undefined) return null;
  const day = parseCalendarDate(raw);
  if (day === null) {
    errors.push({ truong: 'ngay', ma: SEARCH_ERROR_CODES.INVALID_DATE });
    return null;
  }
  // `today` do `todayVN(now)` sinh ra nên luôn đúng dạng
  const offset = day - (parseCalendarDate(today) as number);
  // Cửa sổ [hôm nay, hôm nay + 6] giờ Việt Nam: ngày qua rồi và ngày xa hơn dải 7 ngày đều ngoài khoảng.
  if (offset < 0 || offset > SLOT_WINDOW_DAYS - 1) {
    errors.push({ truong: 'ngay', ma: SEARCH_ERROR_CODES.DATE_OUT_OF_RANGE });
    return null;
  }
  return raw;
}

function shiftOrError(
  raw: string | undefined,
  errors: FieldError[],
): CaLamViec | null {
  if (raw === undefined) return null;
  const found = CA_LAM_VIEC.find((shift) => shift === raw);
  if (found === undefined) {
    errors.push({ truong: 'ca', ma: SUGGEST_FIELD_CODES.INVALID_SHIFT });
    return null;
  }
  return found;
}

/**
 * Kiểm MỌI tham số một lượt rồi báo hết lỗi cùng lúc (400 `BO_LOC_KHONG_HOP_LE` + `loi[]`, nếp của search). `chuyenKhoaId` bắt buộc.
 * `today` là ngày hôm nay giờ Việt Nam của CHÍNH yêu cầu này (`todayVN(now)`), để cửa sổ ngày và mốc `now` của bộ đọc khung giờ cùng một mốc.
 * Id đúng dạng nhưng không tồn tại không phải lỗi ở đây (chuyên khoa thì 404 ở service; chi nhánh thì danh sách rỗng).
 */
export function parseSuggestionQuery(
  query: SuggestionQueryDto,
  today: string,
): SuggestionQuery {
  const errors: FieldError[] = [];
  const chuyenKhoaId = idOrError(query.chuyenKhoaId, 'chuyenKhoaId', errors);
  if (query.chuyenKhoaId === undefined) {
    errors.push({
      truong: 'chuyenKhoaId',
      ma: SEARCH_ERROR_CODES.INVALID_FILTER_ID,
    });
  }
  const chiNhanhId = idOrError(query.chiNhanhId, 'chiNhanhId', errors);
  const ngay = dayOrError(query.ngay, today, errors);
  const ca = shiftOrError(query.ca, errors);
  if (errors.length > 0 || chuyenKhoaId === null) {
    throw new AppException(400, SEARCH_ERROR_CODES.INVALID_FILTER, {
      thongBao: 'Bộ lọc không hợp lệ.',
      loi: errors,
    });
  }
  return { chuyenKhoaId, chiNhanhId, ngay, ca };
}
