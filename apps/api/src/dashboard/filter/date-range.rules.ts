import {
  formatCalendarDate,
  parseCalendarDate,
} from '../../scheduling/calendar-date.js';
import {
  DASHBOARD_FIELD_ERROR_CODES,
  DEFAULT_RANGE_DAYS,
  MAX_RANGE_DAYS,
} from '../dashboard.constants.js';

// Bộ lọc thời gian của dashboard (PLAN dashboard 5.5; Q7, T6). Hàm THUẦN: không DB, không Nest, không đọc đồng hồ (nhận "hôm nay" từ nơi gọi),
// nên test đơn vị chạy được với mọi ngày. Ngày là chuỗi `YYYY-MM-DD` theo giờ Việt Nam; đổi sang "số ngày kể từ 1970" để cộng trừ mà không qua múi giờ máy.

export interface DateRange {
  /** Ngày đầu, gồm cả ngày này */
  tuNgay: string;
  /** Ngày cuối, gồm cả ngày này */
  denNgay: string;
}

/** Hai mốc nửa mở cho cột DATETIME: `[tu, denKe)`, dạng `YYYY-MM-DD HH:MM:SS` (chuỗi, không qua `Date`). */
export interface DateTimeBounds {
  tu: string;
  denKe: string;
}

/** `null` khi khoảng hợp lệ; còn lại là mã lỗi của PLAN 5.8. Chỉ gọi khi cả hai đều là ngày có thật. */
export function rangeError(
  tuNgay: string,
  denNgay: string,
):
  | typeof DASHBOARD_FIELD_ERROR_CODES.INVALID_RANGE
  | typeof DASHBOARD_FIELD_ERROR_CODES.RANGE_TOO_LONG
  | null {
  const days = dayCount({ tuNgay, denNgay });
  if (days < 1) return DASHBOARD_FIELD_ERROR_CODES.INVALID_RANGE;
  if (days > MAX_RANGE_DAYS) return DASHBOARD_FIELD_ERROR_CODES.RANGE_TOO_LONG;
  return null;
}

/** Số ngày của khoảng, tính cả hai đầu (01/12 đến 01/12 là 1 ngày). Âm hoặc 0 khi `denNgay` trước `tuNgay`. */
export function dayCount(range: DateRange): number {
  return epochDay(range.denNgay) - epochDay(range.tuNgay) + 1;
}

/** Không gửi ngày: 30 ngày kết thúc ở hôm nay, gồm cả hôm nay (Q7). */
export function defaultRange(today: string): DateRange {
  return {
    tuNgay: formatCalendarDate(epochDay(today) - (DEFAULT_RANGE_DAYS - 1)),
    denNgay: today,
  };
}

/** Khoảng ngày ⇒ mốc nửa mở `[tuNgay 00:00:00, ngày kế của denNgay 00:00:00)` (PLAN 5.5): 23:59:59 của `denNgay` vào, 00:00:00 ngày kế không vào. */
export function toDateTimeBounds(range: DateRange): DateTimeBounds {
  return {
    tu: `${range.tuNgay} 00:00:00`,
    denKe: `${formatCalendarDate(epochDay(range.denNgay) + 1)} 00:00:00`,
  };
}

function epochDay(ngay: string): number {
  const day = parseCalendarDate(ngay);
  // Nơi gọi đã kiểm ngày có thật (DTO); tới đây mà sai là lỗi lập trình, không phải lỗi người dùng
  if (day === null) throw new Error(`Ngày không hợp lệ: ${ngay}`);
  return day;
}
