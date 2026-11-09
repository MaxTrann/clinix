// Ngày lịch 'YYYY-MM-DD' ⇒ số nguyên "ngày kể từ 1970-01-01" (tính bằng UTC thuần, không phụ thuộc múi giờ máy).
// Dùng để duyệt khoảng ngày và tìm thứ mà không dùng Date theo giờ địa phương (H1).
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** `null` nếu sai dạng hoặc không phải ngày có thật (ví dụ 2026-02-30). */
export function parseCalendarDate(ngay: string): number | null {
  const match = DATE_PATTERN.exec(ngay);
  if (!match) return null;
  const [year, month, day] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  const roundTrips =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return roundTrips ? Math.round(date.getTime() / MS_PER_DAY) : null;
}

export function isCalendarDate(ngay: unknown): ngay is string {
  return typeof ngay === 'string' && parseCalendarDate(ngay) !== null;
}

export function formatCalendarDate(epochDay: number): string {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Thứ ISO (1 = Thứ Hai … 7 = Chủ Nhật). 1970-01-01 là Thứ Năm (4). */
export function isoWeekdayOfEpochDay(epochDay: number): number {
  return ((((epochDay + 3) % 7) + 7) % 7) + 1;
}
