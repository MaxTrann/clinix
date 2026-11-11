import { addDays, DAYS_IN_WEEK, weekStartOf } from './week';

// Tháng theo giờ Việt Nam cho lưới tháng (doctor F3; WL-04, WL-11). Như `week.ts`: làm việc trên chuỗi `YYYY-MM-DD`, phép cộng ở UTC.
// Lưới tháng bắt đầu từ thứ Hai của tuần chứa ngày 1 và kết thúc ở Chủ nhật của tuần chứa ngày cuối: tối đa 6 tuần = 42 ngày,
// đúng trần của API `GET /doctor/schedule` (Q15).

/** Ngày 1 của tháng chứa `isoDate`. */
export function monthStartOf(isoDate: string): string {
  return `${isoDate.slice(0, 8)}01`;
}

/** Ngày 1 của tháng cách `monthStart` đúng `months` tháng (âm = lùi). */
export function addMonths(monthStart: string, months: number): string {
  const year = Number(monthStart.slice(0, 4));
  const month = Number(monthStart.slice(5, 7));
  const moved = new Date(Date.UTC(year, month - 1 + months, 1));
  return moved.toISOString().slice(0, 10);
}

/** Ngày cuối của tháng bắt đầu ở `monthStart`. */
export function lastDayOfMonth(monthStart: string): string {
  return addDays(addMonths(monthStart, 1), -1);
}

export interface MonthGrid {
  // Hai đầu của khoảng ngày cần tải (thứ Hai đầu lưới, Chủ nhật cuối lưới)
  gridStart: string;
  gridEnd: string;
  // Các tuần của lưới, mỗi tuần 7 ngày T2–CN (gồm cả ngày thuộc tháng liền kề)
  weeks: string[][];
}

export function monthGrid(monthStart: string): MonthGrid {
  const gridStart = weekStartOf(monthStart);
  const gridEnd = addDays(weekStartOf(lastDayOfMonth(monthStart)), 6);
  const weeks: string[][] = [];
  for (let start = gridStart; start <= gridEnd; start = addDays(start, 7)) {
    weeks.push(
      Array.from({ length: DAYS_IN_WEEK }, (_, index) => addDays(start, index)),
    );
  }
  return { gridStart, gridEnd, weeks };
}

/** "Tháng 10 năm 2026" */
export function formatMonthLabel(monthStart: string): string {
  return `Tháng ${Number(monthStart.slice(5, 7))} năm ${monthStart.slice(0, 4)}`;
}

/** Ngày thuộc tháng bắt đầu ở `monthStart`? */
export function isInMonth(isoDate: string, monthStart: string): boolean {
  return isoDate.slice(0, 7) === monthStart.slice(0, 7);
}
