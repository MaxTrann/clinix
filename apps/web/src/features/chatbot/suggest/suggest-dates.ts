import {
  addDays,
  formatDayMonth,
  todayVn,
  weekdayLabel,
} from '../../../shared/schedule/week';

// Dải ngày của thẻ gợi ý (chatbot F2, PLAN 5.11 bước 4). Ngày nghiệp vụ là chuỗi `YYYY-MM-DD` theo GIỜ VIỆT NAM; `todayVn` đọc múi giờ
// `Asia/Ho_Chi_Minh` cố định nên KHÔNG phụ thuộc múi giờ của trình duyệt. Tuyệt đối không dùng `getDate()` hay `toISOString().slice(0, 10)`.

// Hôm nay đến hôm nay + 6: đúng cửa sổ máy chủ chấp nhận (ngoài khoảng đó là 400 `NGAY_NGOAI_KHOANG`)
export const SUGGEST_WINDOW_DAYS = 7;

export function suggestWindow(now: Date = new Date()): string[] {
  const today = todayVn(now);
  return Array.from({ length: SUGGEST_WINDOW_DAYS }, (_, index) =>
    addDays(today, index),
  );
}

// "Hôm nay 27/11", "Ngày mai 28/11", "Thứ 2 30/11", "CN 06/12"; `today` là hôm nay theo giờ Việt Nam
export function dayChipLabel(isoDate: string, today: string): string {
  const dayMonth = formatDayMonth(isoDate);
  if (isoDate === today) return `Hôm nay ${dayMonth}`;
  if (isoDate === addDays(today, 1)) return `Ngày mai ${dayMonth}`;
  return `${weekdayLabel(isoDate)} ${dayMonth}`;
}

// "Thứ 6 28/11": dùng cho dòng tóm tắt (ngày máy chủ trả hay ngày người dùng chọn)
export function dayHeadingLabel(isoDate: string): string {
  return `${weekdayLabel(isoDate)} ${formatDayMonth(isoDate)}`;
}
