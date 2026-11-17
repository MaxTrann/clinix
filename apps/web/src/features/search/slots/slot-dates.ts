import { addDays, isoWeekday } from '../../../shared/schedule/week';

// Hàm thuần của dải "Ngày khám" và lưới khung giờ (search PR-C2). Ngày nghiệp vụ là chuỗi `YYYY-MM-DD` theo giờ Việt Nam, không đi qua `Date`
// theo múi giờ máy (nếp `shared/schedule/week.ts`); giờ của khung giờ lấy từ `batDau` (ISO UTC) và luôn hiển thị theo `Asia/Ho_Chi_Minh`.

// Dải 7 ngày: hôm nay đến hôm nay + 6 (Figma; API C1 trả 400 nếu `ngay` ngoài khoảng này). Chỉ là cửa sổ HIỂN THỊ, không phải giới hạn đặt trước.
export const SLOT_WINDOW_DAYS = 7;

export function slotWindow(today: string): string[] {
  return Array.from({ length: SLOT_WINDOW_DAYS }, (_, index) =>
    addDays(today, index),
  );
}

// Thứ ISO 1 (Thứ Hai) đến 7 (Chủ nhật)
const SHORT_WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const LONG_WEEKDAYS = [
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
  'Chủ nhật',
];

export const shortWeekday = (isoDate: string): string =>
  SHORT_WEEKDAYS[isoWeekday(isoDate) - 1];

export const longWeekday = (isoDate: string): string =>
  LONG_WEEKDAYS[isoWeekday(isoDate) - 1];

// `thuNghi` của API (thứ ISO 1 đến 7) ⇒ "Thứ Hai" … "Thứ Bảy", "Chủ nhật"
export const weekdayName = (isoWeekdayNumber: number): string =>
  LONG_WEEKDAYS[isoWeekdayNumber - 1];

function dayAndMonth(isoDate: string): [number, number] {
  const [, month, day] = isoDate.split('-');
  return [Number(day), Number(month)];
}

// "17/11" (không số 0 đứng đầu, như Figma "18/10")
export function dayMonthLabel(isoDate: string): string {
  const [day, month] = dayAndMonth(isoDate);
  return `${day}/${month}`;
}

// "Th11" (nhãn tháng nhỏ của thẻ ngày, Figma "Th10")
export function monthLabel(isoDate: string): string {
  return `Th${dayAndMonth(isoDate)[1]}`;
}

// "Hôm nay 17/11", "Ngày mai 18/11", "T4 19/11" (Make `formatDateLabel`); `today` là hôm nay theo giờ Việt Nam
export function dateLabel(isoDate: string, today: string): string {
  if (isoDate === today) return `Hôm nay ${dayMonthLabel(isoDate)}`;
  if (isoDate === addDays(today, 1))
    return `Ngày mai ${dayMonthLabel(isoDate)}`;
  return `${shortWeekday(isoDate)} ${dayMonthLabel(isoDate)}`;
}

// Tên truy cập của thẻ ngày: "Hôm nay, Thứ Ba 17/11", "Thứ Tư 18/11"
export function dateAccessibleName(isoDate: string, today: string): string {
  const base = `${longWeekday(isoDate)} ${dayMonthLabel(isoDate)}`;
  return isoDate === today ? `Hôm nay, ${base}` : base;
}

const VN_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// "09:30" theo GIỜ VIỆT NAM từ `batDau` (ISO UTC); KHÔNG dùng `getHours()` vì nó theo múi giờ của trình duyệt
export function timeLabel(isoUtc: string): string {
  const parts = VN_TIME.formatToParts(new Date(isoUtc));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? '00';
  return `${part('hour')}:${part('minute')}`;
}
