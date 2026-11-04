import type { WeekdayHours } from '../api/search-types';

export interface HoursGroup {
  // "Thứ 2 – Thứ 6", "Thứ 7", "Chủ nhật"
  label: string;
  // "08:00 – 12:00, 13:00 – 17:00" hoặc "Nghỉ"
  text: string;
}

const WEEKDAY_NAMES: Record<number, string> = {
  1: 'Thứ 2',
  2: 'Thứ 3',
  3: 'Thứ 4',
  4: 'Thứ 5',
  5: 'Thứ 6',
  6: 'Thứ 7',
  7: 'Chủ nhật',
};

export const CLOSED_TEXT = 'Nghỉ';

/** Giờ của một ngày: cả hai khoảng (Q4); ngày nghỉ hoặc chưa khai báo ⇒ "Nghỉ". */
export function formatDayHours(day: WeekdayHours): string {
  const open = day.hoatDong;
  if (!open) return CLOSED_TEXT;
  const parts = [open.sang, open.chieu]
    .filter((range) => range !== null)
    .map((range) => `${range.tu} – ${range.den}`);
  return parts.length > 0 ? parts.join(', ') : CLOSED_TEXT;
}

/** Gộp các thứ liền nhau có cùng giờ thành một dòng ("Thứ 2 – Thứ 6: …"), khớp bố cục chân trang của Figma. */
export function groupWeeklyHours(week: readonly WeekdayHours[]): HoursGroup[] {
  const days = [...week].sort((a, b) => a.thuTrongTuan - b.thuTrongTuan);
  const groups: { first: number; last: number; text: string }[] = [];
  for (const day of days) {
    const text = formatDayHours(day);
    const previous = groups[groups.length - 1];
    if (previous && previous.text === text) {
      previous.last = day.thuTrongTuan;
    } else {
      groups.push({ first: day.thuTrongTuan, last: day.thuTrongTuan, text });
    }
  }
  return groups.map(({ first, last, text }) => ({
    label:
      first === last
        ? (WEEKDAY_NAMES[first] ?? `Thứ ${first}`)
        : `${WEEKDAY_NAMES[first]} – ${WEEKDAY_NAMES[last]}`,
    text,
  }));
}
