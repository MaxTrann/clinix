import {
  addMonths,
  lastDayOfMonth,
  monthStartOf,
} from '../../../shared/schedule/month';
import { addDays, weekStartOf } from '../../../shared/schedule/week';

// Hàm thuần của hộp chọn tuần/tháng (doctor UX5, G2). Ngày là chuỗi `YYYY-MM-DD`; không dựng `Date` từ chuỗi (lệch UTC), chỉ dùng hàm của `shared/schedule`
// (phép cộng ở UTC trên ba số năm-tháng-ngày). Chuỗi cùng độ dài nên so sánh chữ cũng là so sánh ngày.

// Khoảng hộp cho chọn. API `GET /doctor/schedule` KHÔNG có mốc xa nhất (chỉ hai ngày hợp lệ và tối đa 42 ngày, `schedule-view.rules.ts`), nên đây là mốc
// của GIAO DIỆN [đề xuất; Đại chọn 23/11/2026, không có trong tài liệu]: nằm trong vùng web tính đúng (năm 100 đến 9999; `Date.UTC(99, …)` ra năm 1999,
// còn sau năm 9999 `toISOString` ra "+010000-…" làm `parse` ném lỗi).
export const PICKER_MIN = '2000-01-01';
export const PICKER_MAX = '2099-12-31';
const MIN_MONTH = monthStartOf(PICKER_MIN);
const MAX_MONTH = monthStartOf(PICKER_MAX);

const GRID_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/** Phím điều hướng của lưới (cả lưới ngày lẫn lưới tháng). */
export function isGridKey(key: string): boolean {
  return GRID_KEYS.has(key);
}

export function clampDate(date: string): string {
  if (date < PICKER_MIN) return PICKER_MIN;
  return date > PICKER_MAX ? PICKER_MAX : date;
}

/** `monthStart` là ngày 1 của tháng. */
export function clampMonth(monthStart: string): string {
  if (monthStart < MIN_MONTH) return MIN_MONTH;
  return monthStart > MAX_MONTH ? MAX_MONTH : monthStart;
}

export function isDayEnabled(date: string): boolean {
  return date >= PICKER_MIN && date <= PICKER_MAX;
}

export function isMonthEnabled(monthStart: string): boolean {
  return monthStart >= MIN_MONTH && monthStart <= MAX_MONTH;
}

/** Cách `date` đúng `months` tháng, GIỮ ngày; tháng đích ngắn hơn thì kẹp về ngày cuối (31/03 lùi một tháng ra 28/02 hoặc 29/02). */
export function addMonthsKeepDay(date: string, months: number): string {
  const target = addMonths(monthStartOf(date), months);
  const lastDay = Number(lastDayOfMonth(target).slice(8, 10));
  const day = Math.min(Number(date.slice(8, 10)), lastDay);
  return `${target.slice(0, 8)}${String(day).padStart(2, '0')}`;
}

/** Cách `date` đúng `years` năm (29/02 sang năm không nhuận ra 28/02). */
export function addYearsKeepDay(date: string, years: number): string {
  return addMonthsKeepDay(date, years * 12);
}

/**
 * Ngày mới khi bấm một phím trên lưới ngày; `null` nếu không phải phím của lưới. ← → ±1 ngày, ↑ ↓ ±7 ngày, Home = thứ Hai và End = Chủ nhật của tuần chứa ngày
 * (tuần bắt đầu thứ Hai, như lưới tuần), PageUp/PageDown ±1 tháng, kèm Shift ±1 năm. Luôn kẹp trong khoảng của hộp.
 */
export function moveDay(
  date: string,
  key: string,
  shift = false,
): string | null {
  switch (key) {
    case 'ArrowLeft':
      return clampDate(addDays(date, -1));
    case 'ArrowRight':
      return clampDate(addDays(date, 1));
    case 'ArrowUp':
      return clampDate(addDays(date, -7));
    case 'ArrowDown':
      return clampDate(addDays(date, 7));
    case 'Home':
      return clampDate(weekStartOf(date));
    case 'End':
      return clampDate(addDays(weekStartOf(date), 6));
    case 'PageUp':
      return clampDate(
        shift ? addYearsKeepDay(date, -1) : addMonthsKeepDay(date, -1),
      );
    case 'PageDown':
      return clampDate(
        shift ? addYearsKeepDay(date, 1) : addMonthsKeepDay(date, 1),
      );
    default:
      return null;
  }
}

/** Tháng mới khi bấm một phím trên lưới 12 tháng (3 cột): ← → ±1, ↑ ↓ ±3, Home/End = tháng 1/tháng 12 của năm, PageUp/PageDown ±12; `null` nếu không phải phím của lưới. */
export function moveMonth(monthStart: string, key: string): string | null {
  const year = monthStart.slice(0, 4);
  switch (key) {
    case 'ArrowLeft':
      return clampMonth(addMonths(monthStart, -1));
    case 'ArrowRight':
      return clampMonth(addMonths(monthStart, 1));
    case 'ArrowUp':
      return clampMonth(addMonths(monthStart, -3));
    case 'ArrowDown':
      return clampMonth(addMonths(monthStart, 3));
    case 'Home':
      return clampMonth(`${year}-01-01`);
    case 'End':
      return clampMonth(`${year}-12-01`);
    case 'PageUp':
      return clampMonth(addMonths(monthStart, -12));
    case 'PageDown':
      return clampMonth(addMonths(monthStart, 12));
    default:
      return null;
  }
}

/** Mười hai đầu tháng của `year`, theo thứ tự tháng 1 đến 12. */
export function monthsOfYear(year: number): string[] {
  const text = String(year).padStart(4, '0');
  return Array.from(
    { length: 12 },
    (_, index) => `${text}-${String(index + 1).padStart(2, '0')}-01`,
  );
}
