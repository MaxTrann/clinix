import {
  formatCalendarDate,
  isoWeekdayOfEpochDay,
} from '../../scheduling/calendar-date.js';
import { MAX_DAILY_TREND_DAYS } from '../dashboard.constants.js';
import { dayCount, epochDay, type DateRange } from './date-range.rules.js';

// Gom điểm của biểu đồ xu hướng đăng ký khám (PLAN dashboard 5.6 (6); Q5, T8). Hàm THUẦN: SQL chỉ trả số lịch theo TỪNG NGÀY, ở đây chia khoảng
// thành điểm và cộng số. Khoảng tối đa 62 ngày: một điểm mỗi ngày; dài hơn: một điểm mỗi tuần (thứ Hai đến Chủ nhật), tuần đầu và tuần cuối CẮT theo
// hai đầu khoảng. Luôn trả ĐỦ điểm kể cả điểm 0, để web chỉ vẽ, không tự điền.

export type TrendUnit = 'Ngay' | 'Tuan';

export interface TrendPoint {
  tuNgay: string;
  denNgay: string;
  soLuong: number;
}

export interface Trend {
  donVi: TrendUnit;
  diem: TrendPoint[];
}

/** `perDay`: số lịch của từng ngày `YYYY-MM-DD` (ngày không có lịch thì không cần có khoá). */
export function buildTrend(
  range: DateRange,
  perDay: ReadonlyMap<string, number>,
): Trend {
  const daily = dayCount(range) <= MAX_DAILY_TREND_DAYS;
  const first = epochDay(range.tuNgay);
  const last = epochDay(range.denNgay);
  const diem: TrendPoint[] = [];
  let start = first;
  while (start <= last) {
    // Ngày: điểm dài 1 ngày. Tuần: tới Chủ nhật của tuần chứa `start` (thứ ISO 7), nhưng không quá ngày cuối của khoảng
    const end = daily
      ? start
      : Math.min(start + (7 - isoWeekdayOfEpochDay(start)), last);
    let soLuong = 0;
    for (let day = start; day <= end; day += 1)
      soLuong += perDay.get(formatCalendarDate(day)) ?? 0;
    diem.push({
      tuNgay: formatCalendarDate(start),
      denNgay: formatCalendarDate(end),
      soLuong,
    });
    start = end + 1;
  }
  return { donVi: daily ? 'Ngay' : 'Tuan', diem };
}
