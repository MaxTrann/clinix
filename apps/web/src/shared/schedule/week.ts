// Tuần T2–CN theo giờ Việt Nam (doctor F2; WL-03, WL-11). Ngày nghiệp vụ là chuỗi `YYYY-MM-DD`, KHÔNG đi qua `Date` theo múi giờ máy:
// mọi phép cộng/trừ ngày làm ở UTC trên đúng ba số năm-tháng-ngày, nên đổi tháng, đổi năm, năm nhuận không phụ thuộc múi giờ trình duyệt.
export const DAYS_IN_WEEK = 7;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const VN_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function parse(isoDate: string): Date {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new RangeError(`Ngày không hợp lệ: ${isoDate}`);
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Hôm nay theo giờ Việt Nam, dạng `YYYY-MM-DD` (nhận `now` để test dùng đồng hồ giả). */
export function todayVn(now: Date = new Date()): string {
  return VN_DATE_FORMAT.format(now);
}

export function addDays(isoDate: string, days: number): string {
  const date = parse(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return format(date);
}

/** Thứ trong tuần kiểu ISO: 1 = thứ Hai … 7 = Chủ nhật. */
export function isoWeekday(isoDate: string): number {
  const day = parse(isoDate).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Thứ Hai của tuần chứa `isoDate` (Chủ nhật thuộc tuần TRƯỚC thứ Hai kế tiếp, như lịch Việt Nam). */
export function weekStartOf(isoDate: string): string {
  return addDays(isoDate, 1 - isoWeekday(isoDate));
}

/** Bảy ngày T2…CN bắt đầu từ `weekStart`. */
export function weekDays(weekStart: string): string[] {
  return Array.from({ length: DAYS_IN_WEEK }, (_, index) =>
    addDays(weekStart, index),
  );
}

/** Nhãn thứ: "Thứ 2" … "Thứ 7", "CN". */
export function weekdayLabel(isoDate: string): string {
  const weekday = isoWeekday(isoDate);
  return weekday === 7 ? 'CN' : `Thứ ${weekday + 1}`;
}

/** "12/10" */
export function formatDayMonth(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

/** "12/10/2026" */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/** "Thứ 2, 12/10/2026" */
export function formatWeekdayDate(isoDate: string): string {
  return `${weekdayLabel(isoDate)}, ${formatDate(isoDate)}`;
}

/** "12/10 – 18/10/2026" (hai đầu của tuần; năm theo ngày cuối). */
export function formatWeekRange(weekStart: string): string {
  return `${formatDayMonth(weekStart)} – ${formatDate(addDays(weekStart, DAYS_IN_WEEK - 1))}`;
}
