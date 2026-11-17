import { AppException } from '../../common/errors/app.exception.js';
import { parseCalendarDate } from '../../scheduling/calendar-date.js';
import { parseFilterId } from '../common/id-param.js';
import {
  SEARCH_ERROR_CODES,
  SLOT_MAX_DOCTORS,
  SLOT_WINDOW_DAYS,
} from '../search.constants.js';
import type { PublicSlotQueryDto } from './public-slot.dto.js';

/** Tham số đã kiểm: id là chuỗi (không mất độ chính xác BIGINT), đã bỏ trùng và giữ thứ tự xuất hiện đầu tiên. */
export interface SlotQuery {
  bacSiIds: string[];
  ngay: string;
}

type FieldError = { truong: string; ma: string };

// Cùng bộ kiểm id BIGINT dương với bộ lọc của danh sách bác sĩ (một nguồn): `parseFilterId` ném khi sai dạng.
function isDoctorId(token: string): boolean {
  try {
    parseFilterId(token, 'bacSiIds');
    return true;
  } catch (error) {
    if (error instanceof AppException) return false;
    throw error;
  }
}

function parseDoctorIds(raw: string | undefined, errors: FieldError[]) {
  const invalid = (ma: string): string[] => {
    errors.push({ truong: 'bacSiIds', ma });
    return [];
  };
  if (raw === undefined) return invalid(SEARCH_ERROR_CODES.INVALID_DOCTOR_IDS);
  const unique = new Set<string>();
  for (const token of raw.split(',')) {
    // Dừng ở token sai đầu tiên: không tốn công với chuỗi dài toàn rác.
    if (!isDoctorId(token))
      return invalid(SEARCH_ERROR_CODES.INVALID_DOCTOR_IDS);
    unique.add(token);
  }
  // Trần tính trên id KHÁC NHAU: id lặp không làm tăng công việc (reader và câu lọc đều nhận tập đã bỏ trùng).
  if (unique.size > SLOT_MAX_DOCTORS)
    return invalid(SEARCH_ERROR_CODES.TOO_MANY_DOCTORS);
  return [...unique];
}

function parseDay(
  raw: string | undefined,
  today: string,
  errors: FieldError[],
): string {
  const fail = (ma: string): string => {
    errors.push({ truong: 'ngay', ma });
    return '';
  };
  const day = raw === undefined ? null : parseCalendarDate(raw);
  if (raw === undefined || day === null)
    return fail(SEARCH_ERROR_CODES.INVALID_DATE);
  const offset = day - (parseCalendarDate(today) as number);
  // Cửa sổ [hôm nay, hôm nay + 6]: ngày qua rồi và ngày xa hơn dải 7 ngày đều ngoài khoảng.
  if (offset < 0 || offset > SLOT_WINDOW_DAYS - 1)
    return fail(SEARCH_ERROR_CODES.DATE_OUT_OF_RANGE);
  return raw;
}

/**
 * Kiểm MỌI tham số một lượt rồi báo hết lỗi cùng lúc (400 `BO_LOC_KHONG_HOP_LE` + `loi[]`, PLAN 5.6, 5.8).
 * `today` là ngày hôm nay giờ Việt Nam (`todayVN(now)` của CHÍNH request này) để cửa sổ và `now` của reader cùng một mốc.
 */
export function parseSlotQuery(
  query: Pick<PublicSlotQueryDto, 'bacSiIds' | 'ngay'>,
  today: string,
): SlotQuery {
  const errors: FieldError[] = [];
  const bacSiIds = parseDoctorIds(query.bacSiIds, errors);
  const ngay = parseDay(query.ngay, today, errors);
  if (errors.length > 0) {
    throw new AppException(400, SEARCH_ERROR_CODES.INVALID_FILTER, {
      thongBao: 'Bộ lọc không hợp lệ.',
      loi: errors,
    });
  }
  return { bacSiIds, ngay };
}
