import { formatDayMonth, todayVn } from '../../../shared/schedule/week';
import type { SuggestedDoctor } from '../api/chatbot-types';
import { suggestRating } from '../widget/chatbot-text';

// Định dạng hiển thị của thẻ gợi ý. KHÔNG có phép tính nào: giờ trống, giá, điểm đều do máy chủ trả; ở đây chỉ đổi dạng chữ.

const VN_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// "09:30" theo GIỜ VIỆT NAM từ `batDau` (ISO UTC). Bản chép của `timeLabel` ở `features/search/slots/slot-dates.ts` (chatbot không import
// `features/search`, PLAN 1.2); `router/chatbot-suggest-route.test.tsx` khoá hai hàm cho cùng kết quả. KHÔNG dùng `getHours()`:
// nó theo múi giờ của trình duyệt.
export function timeLabelVn(isoUtc: string): string {
  const parts = VN_TIME.formatToParts(new Date(isoUtc));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? '00';
  return `${part('hour')}:${part('minute')}`;
}

// "28/11" theo giờ Việt Nam của một khung giờ (`todayVn` nhận một mốc bất kỳ và trả ngày Việt Nam của mốc đó)
export function slotDayMonthVn(isoUtc: string): string {
  return formatDayMonth(todayVn(new Date(isoUtc)));
}

// Điểm của bác sĩ: "4.5 · 12 đánh giá"; chưa có đánh giá (điểm `null` hay 0 lượt) thì `null` để ẩn
export function ratingLabel(rating: SuggestedDoctor['danhGia']): string | null {
  if (rating.diemTrungBinh === null || rating.soDanhGia === 0) return null;
  return suggestRating(
    Number(rating.diemTrungBinh).toFixed(1),
    rating.soDanhGia,
  );
}
