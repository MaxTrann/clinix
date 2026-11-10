import {
  formatCalendarDate,
  parseCalendarDate,
} from '../../scheduling/calendar-date.js';

// Phần THUẦN dùng chung của các danh sách lịch hẹn (task B1; B3, B4, B5 import lại; PLAN booking 5.8; TRACKING 3.13 B1-B). Không DB, không Nest.
// Mỗi hàm là một chỗ ValidationPipe hay SQL cần mà `class-validator` không tự làm (đã đo ở X1, M8): mảng một giá trị, id BIGINT, ngày có thật, cận ngày.

const BIGINT_MAX = '9223372036854775807';
const ID_PATTERN = /^[1-9]\d{0,18}$/;

/** Id BIGINT dương, dạng CHUỖI (id lớn hơn 2^53 mà ép `Number` sẽ trỏ nhầm dòng khác); không vượt giá trị lớn nhất của BIGINT có dấu. */
export function isBigintId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    ID_PATTERN.test(value) &&
    (value.length < BIGINT_MAX.length || value <= BIGINT_MAX)
  );
}

/** Giá trị đúng chữ của bộ lọc hồ sơ đi khám cho chính Bệnh nhân (`ho_so_nguoi_than_id IS NULL`). */
export const VISIT_PROFILE_SELF = 'BanThan';

/** Bộ lọc hồ sơ đi khám: `BanThan` hoặc id hồ sơ người thân. */
export function isVisitProfileFilter(value: unknown): value is string {
  return value === VISIT_PROFILE_SELF || isBigintId(value);
}

/**
 * Chuẩn hoá tham số mảng của query cho `@Transform` (X1 M8): lặp khoá (`a=1&a=2`) ra mảng sẵn; MỘT giá trị hoặc giá trị có dấu phẩy ra chuỗi nên
 * `@IsArray` báo lỗi, vì vậy tách theo dấu phẩy và bỏ phần tử trùng (giữ thứ tự). Không cắt khoảng trắng: ` DaHuy` vẫn là giá trị lạ.
 * Giá trị không phải chuỗi hay mảng chuỗi (số, đối tượng) giữ nguyên để bước kiểm báo lỗi.
 */
export function toStringArray(value: unknown): unknown {
  const parts =
    typeof value === 'string'
      ? [value]
      : Array.isArray(value) && value.every((part) => typeof part === 'string')
        ? (value as string[])
        : null;
  if (parts === null) return value;
  return [...new Set(parts.flatMap((part) => part.split(',')))];
}

/** Ngày cuối cùng mà cột `datetime` của MySQL biểu diễn được: ngày kế tiếp của nó tràn sang năm 10000. */
export const LAST_DAY = '9999-12-31';

/** Cận của khoảng ngày trên `thoi_gian` (cột `datetime` giờ VN), viết bằng CHUỖI `YYYY-MM-DD HH:mm:ss`; `null` = không chặn phía đó. */
export interface DayBounds {
  /** `thoi_gian >= from` */
  from: string | null;
  /** `thoi_gian < to` (nửa mở: 00:00:00 của ngày kế tiếp) */
  to: string | null;
}

function epochDayOf(day: string): number {
  const epochDay = parseCalendarDate(day);
  if (epochDay === null) throw new RangeError('Ngày không có thật');
  return epochDay;
}

/**
 * Ngày `tuNgay` và `denNgay` (đã kiểm là ngày có thật) ra cận trên `thoi_gian`: `>= tuNgay 00:00:00` và `< ngày kế của denNgay 00:00:00`. Khoảng NỬA MỞ
 * trên `thoi_gian` (không bọc cột bằng `DATE()`, AR-05): cả ngày `denNgay` còn trong khoảng, "đóng" ở mức NGÀY (LSH-12). Chuỗi, không `Date`: không
 * qua múi giờ của driver (H1, M4), vì cột lưu giờ VN và ngày của người dùng cũng là ngày VN. `denNgay` = `LAST_DAY` thì bỏ cận trên.
 */
export function dayBounds(
  tuNgay: string | undefined,
  denNgay: string | undefined,
): DayBounds {
  let from: string | null = null;
  if (tuNgay !== undefined) {
    epochDayOf(tuNgay); // sai ngày thì ném RangeError: DTO đã chặn, đây là lưới an toàn
    from = `${tuNgay} 00:00:00`;
  }
  let to: string | null = null;
  if (denNgay !== undefined) {
    const epochDay = epochDayOf(denNgay);
    if (denNgay !== LAST_DAY)
      to = `${formatCalendarDate(epochDay + 1)} 00:00:00`;
  }
  return { from, to };
}

/** `denNgay` không trước `tuNgay`; hai chuỗi đã là ngày có thật. */
export function isNotBefore(tuNgay: string, denNgay: string): boolean {
  return epochDayOf(denNgay) >= epochDayOf(tuNgay);
}

/** Giao của các tập trạng thái, theo thứ tự của `first`; tập `undefined` là "không giới hạn". */
export function intersectStates<T>(
  first: readonly T[],
  ...others: (readonly T[] | undefined)[]
): T[] {
  return first.filter((state) =>
    others.every((other) => other === undefined || other.includes(state)),
  );
}
