import { dayLabel } from './branch-schedule-format';
import { isTime } from './branch-schedule-validation';
import type { ScheduleDraft } from './schedule-draft';

// Panel "Áp dụng nhanh" (admin PR2 mục 6.4), phần thuần. Hành vi Đại duyệt 16/11/2026: ghi giờ vào buổi đã chọn của CÁC NGÀY ĐƯỢC
// TICK, tự bật ngày ("Hoạt động") và buổi đó; KHÔNG đụng buổi còn lại hay ngày không tick. Hợp lệ giờ từng ngày (sáng kết thúc
// ≤ chiều bắt đầu…) vẫn do `validateWeeklySchedule` kiểm lúc Lưu.

export type QuickPeriod = 'morning' | 'afternoon';

export interface QuickApplyInput {
  period: QuickPeriod;
  start: string;
  end: string;
  days: readonly number[];
}

// Hai giờ hợp lệ 24h, bắt đầu < kết thúc (so chuỗi HH:mm đúng thứ tự thời gian) và có ít nhất một ngày
export function canApplyQuick(input: QuickApplyInput): boolean {
  return (
    isTime(input.start) &&
    isTime(input.end) &&
    input.start < input.end &&
    input.days.length > 0
  );
}

export function applyQuickSchedule(
  schedule: readonly ScheduleDraft[],
  input: QuickApplyInput,
): ScheduleDraft[] {
  const ticked = new Set(input.days);
  return schedule.map((day) => {
    if (!ticked.has(day.day)) return day;
    const next: ScheduleDraft = { ...day, open: true };
    next[input.period] = { enabled: true, start: input.start, end: input.end };
    return next;
  });
}

// "Thứ 2–Thứ 6" cho ngày liền kề, "Thứ 2, Thứ 4, CN" cho ngày rời nhau
export function describeDays(days: readonly number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const day of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[1] === day - 1) last[1] = day;
    else runs.push([day, day]);
  }
  return runs
    .map(([from, to]) =>
      from === to ? dayLabel(from) : `${dayLabel(from)}–${dayLabel(to)}`,
    )
    .join(', ');
}
