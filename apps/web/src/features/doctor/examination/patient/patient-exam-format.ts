// Hàm thuần định dạng ngày giờ cho trang Hồ sơ khám bệnh của Bệnh nhân (doctor-exam F5; WXH-12; Figma `414:2`, `443:2`, `415:2`). Việt Nam không có giờ mùa hè: cố định +07:00, nên KHÔNG phụ thuộc múi giờ của máy
// (cộng 7 giờ rồi đọc theo UTC, như `formatUpdatedAt` của F2). Không đọc đồng hồ (`now` là tham số), không đụng DOM. Chuỗi không phải ISO 8601 ⇒ `null` (nơi gọi bỏ chỗ đó thay vì in "NaN").
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// Số tab năm: năm hiện tại và 4 năm trước (Đại duyệt 16/11/2026; API không trả danh sách năm có ca: `TECH_DEBT` 166)
export const YEAR_TAB_COUNT = 5;

// Chỉ số là `getUTCDay()` (0 là Chủ nhật)
const WEEKDAY_SHORT = [
  'CN',
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7',
];
const WEEKDAY_LONG = [
  'Chủ nhật',
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7',
];

const pad = (value: number) => String(value).padStart(2, '0');

// Thời điểm theo giờ Việt Nam, đọc bằng các hàm UTC của `Date` đã cộng 7 giờ
function vietnamTime(iso: string): Date | null {
  if (!ISO_DATE_TIME.test(iso)) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms + VN_OFFSET_MS);
}

// Thứ ở cột ngày của hàng ca: "CN", "Thứ 2" … "Thứ 7" (Figma `443:2`)
export function weekdayShort(iso: string): string | null {
  const vn = vietnamTime(iso);
  return vn === null ? null : WEEKDAY_SHORT[vn.getUTCDay()];
}

// Ngày trong tháng KHÔNG đệm số 0 ("5", "18"), như Figma `443:2`
export function dayOfMonth(iso: string): string | null {
  const vn = vietnamTime(iso);
  return vn === null ? null : String(vn.getUTCDate());
}

// "09:30"
export function formatVisitTime(iso: string): string | null {
  const vn = vietnamTime(iso);
  return vn === null
    ? null
    : `${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}`;
}

// "Thứ 4, 10/06/2026" và "Chủ nhật, 18/10/2026" (Figma `443:2`, `415:2`)
export function formatVisitDate(iso: string): string | null {
  const vn = vietnamTime(iso);
  if (vn === null) return null;
  return `${WEEKDAY_LONG[vn.getUTCDay()]}, ${pad(vn.getUTCDate())}/${pad(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()}`;
}

// Ngày tái khám `YYYY-MM-DD` (không có múi giờ) ⇒ "Thứ 6, 10/07/2026" (Figma `443:2`); ngày không có thật (30/02) hay sai dạng ⇒ `null` (khối bị bỏ)
export function formatReturnDate(isoDate: string): string | null {
  const match = DATE_ONLY.exec(isoDate);
  if (match === null) return null;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return real
    ? `${WEEKDAY_LONG[date.getUTCDay()]}, ${match[3]}/${match[2]}/${match[1]}`
    : null;
}

// "17:30 10/6/26": giờ phút đệm 0, ngày và tháng KHÔNG đệm, năm hai chữ số (Figma `443:2`, dòng "Cập nhật lần cuối")
export function formatUpdatedLine(iso: string): string | null {
  const vn = vietnamTime(iso);
  if (vn === null) return null;
  const year = String(vn.getUTCFullYear()).slice(-2);
  return `${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())} ${vn.getUTCDate()}/${vn.getUTCMonth() + 1}/${year}`;
}

// Năm hiện tại THEO GIỜ VIỆT NAM (31/12 lúc 17:00Z đã là 00:00 ngày 01/01 năm sau ở Việt Nam)
export function currentYearVN(now: Date): number {
  return new Date(now.getTime() + VN_OFFSET_MS).getUTCFullYear();
}

// Các tab năm, mới nhất đứng đầu: [năm, năm − 1, …]
export function yearTabs(currentYear: number): number[] {
  return Array.from(
    { length: YEAR_TAB_COUNT },
    (_, index) => currentYear - index,
  );
}

// Tháng (1 đến 12) MỚI NHẤT có ít nhất một ca; không tháng nào có ca ⇒ `null`. Tháng mặc định của trang (Figma `414:2`: Tháng 10; `443:2`: Tháng 6)
export function latestMonthWithCases(counts: readonly number[]): number | null {
  for (let month = counts.length; month >= 1; month -= 1) {
    if (counts[month - 1] > 0) return month;
  }
  return null;
}

export function totalCases(counts: readonly number[]): number {
  return counts.reduce((sum, count) => sum + count, 0);
}

// "Tháng 10 2026" (đầu thẻ danh sách, Figma `414:2`)
export function monthTitle(year: number, month: number): string {
  return `Tháng ${month} ${year}`;
}
