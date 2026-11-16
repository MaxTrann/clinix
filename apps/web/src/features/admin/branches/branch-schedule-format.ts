import type { BranchPeriod, BranchSchedule } from './branch-types';

const DAY_LABELS: Record<number, string> = {
  1: 'Thứ 2',
  2: 'Thứ 3',
  3: 'Thứ 4',
  4: 'Thứ 5',
  5: 'Thứ 6',
  6: 'Thứ 7',
  7: 'CN',
};

const UNDECLARED = 'Chưa khai báo giờ nhận khám';

export function dayLabel(day: number): string {
  return DAY_LABELS[day] ?? `Thứ ${day}`;
}

function formatPeriod(period: BranchPeriod): string {
  return `${period.batDau.slice(0, 5)}–${period.ketThuc.slice(0, 5)}`;
}

// Nội dung giờ của MỘT ngày; null là chưa biết (`hoatDong` null) nên bỏ qua, không tạo dòng
function dayText(day: BranchSchedule): string | null {
  if (day.hoatDong === false) return 'Nghỉ';
  if (day.hoatDong !== true) return null;
  const periods: string[] = [];
  if (day.sang) periods.push(`Sáng ${formatPeriod(day.sang)}`);
  if (day.chieu) periods.push(`Chiều ${formatPeriod(day.chieu)}`);
  return periods.length > 0 ? periods.join(' · ') : UNDECLARED;
}

// Giờ nhận khám của thẻ chi nhánh thành danh sách dòng (PR1 mục 8): các ngày LIỀN KỀ cùng nội dung gộp một dòng,
// ví dụ "Thứ 2–Thứ 6: Sáng 08:00–11:30 · Chiều 13:30–17:00"; ngày nghỉ ghi "Nghỉ"; hai đoạn cùng giờ nhưng bị ngăn bởi
// một ngày khác thì KHÔNG nối lại.
export function scheduleLines(schedule: BranchSchedule[]): string[] {
  const groups: { first: number; last: number; text: string }[] = [];
  const days = [...schedule].sort((a, b) => a.thuTrongTuan - b.thuTrongTuan);
  for (const day of days) {
    const text = dayText(day);
    if (text === null) continue;
    const previous = groups[groups.length - 1];
    if (
      previous &&
      previous.text === text &&
      previous.last === day.thuTrongTuan - 1
    ) {
      previous.last = day.thuTrongTuan;
    } else {
      groups.push({
        first: day.thuTrongTuan,
        last: day.thuTrongTuan,
        text,
      });
    }
  }
  if (groups.length === 0) return [UNDECLARED];
  return groups.map((group) =>
    group.first === group.last
      ? `${dayLabel(group.first)}: ${group.text}`
      : `${dayLabel(group.first)}–${dayLabel(group.last)}: ${group.text}`,
  );
}
