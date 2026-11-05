// Luật ngày sinh (patient P1, quyết định Q7; TRACKING patient P1-C). Hàm thuần, không import gì để frontend sao chép được.
// `today` do nơi gọi truyền vào (API: todayVN() của common/time): web không có todayVN, và test luật không cần đồng hồ giả.

export const BIRTH_DATE_MIN = '1900-01-01';

// Đúng dạng YYYY-MM-DD bằng chữ số ASCII: không cắt khoảng trắng, không nhận giờ, không nhận dd/mm/yyyy hay tháng một chữ số
const ISO_DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const MONTHS_WITH_30_DAYS = [4, 6, 9, 11];

// Lịch Gregory: năm chia hết cho 4 là năm nhuận, trừ năm chia hết cho 100 mà không chia hết cho 400 (1900, 2100 không nhuận; 2000 nhuận)
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return MONTHS_WITH_30_DAYS.includes(month) ? 30 : 31;
}

/**
 * Hợp lệ khi `value` đúng dạng YYYY-MM-DD, là ngày có thật và nằm trong [1900-01-01, today]. `today` cũng ở dạng YYYY-MM-DD
 * (ngày lịch Việt Nam). Kiểm ngày có thật bằng số học, không qua `Date` (Date tự lăn 2026-02-30 thành 2026-03-02).
 */
export function isValidBirthDate(value: string, today: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  // Cùng dạng YYYY-MM-DD độ dài cố định nên so chuỗi chính là so ngày
  return value >= BIRTH_DATE_MIN && value <= today;
}
