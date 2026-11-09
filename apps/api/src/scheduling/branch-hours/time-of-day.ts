import { weekdayVN } from '../../common/time/time.js';
import type { ShiftRange } from './branch-hours.types.js';

const SECONDS_PER_DAY = 86400;
// Việt Nam không có giờ mùa hè nên độ lệch cố định +07:00.
const VN_OFFSET_SECONDS = 7 * 3600;

/** Số giây từ 00:00 giờ VN của thời điểm `instant`. */
export function secondsOfDayVN(instant: Date): number {
  const utcSeconds = Math.floor(instant.getTime() / 1000);
  return (
    (((utcSeconds + VN_OFFSET_SECONDS) % SECONDS_PER_DAY) + SECONDS_PER_DAY) %
    SECONDS_PER_DAY
  );
}

/** Thứ ISO (1 = Thứ Hai … 7 = Chủ Nhật) của ngày lịch 'YYYY-MM-DD'; khớp WEEKDAY()+1 của MySQL. */
export function isoWeekdayOf(ngay: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay)) {
    throw new Error(`Ngày không đúng dạng YYYY-MM-DD: ${ngay}`);
  }
  return weekdayVN(new Date(`${ngay}T00:00:00+07:00`));
}

/** Giây ⇒ 'HH:MM' (bỏ phần giây). */
export function formatHHMM(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Cùng dạng `{ tu, den }` với search/common/weekly-schedule.view.ts để hai bên không tự đổi lần hai. */
export function formatRange(range: ShiftRange): { tu: string; den: string } {
  return { tu: formatHHMM(range.tuGiay), den: formatHHMM(range.denGiay) };
}
