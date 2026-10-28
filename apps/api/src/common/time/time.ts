/** Múi giờ nghiệp vụ của CLINIX; không phụ thuộc timezone của máy chạy API. */
export const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const vietnamDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: VIETNAM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Trả về instant hiện tại; dùng đồng hồ giả của Vitest được như Date thông thường. */
export function nowVN(): Date {
  return new Date();
}

/**
 * Cắt phần mili giây (làm tròn XUỐNG giây), trả về Date MỚI và không sửa đầu vào. DATETIME của MySQL chỉ có độ chính xác giây
 * và làm tròn phần lẻ khi lưu, nên cắt trước khi ghi để giá trị lưu và giá trị so sánh trong mã luôn khớp nhau.
 */
export function toSecond(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

/** Ngày lịch Việt Nam ở dạng YYYY-MM-DD. */
export function todayVN(instant: Date = nowVN()): string {
  const { year, month, day } = vietnamDateParts(instant);
  return `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

/** Thứ theo chuẩn ISO: thứ Hai = 1, ..., Chủ nhật = 7. */
export function weekdayVN(instant: Date = nowVN()): number {
  const { year, month, day } = vietnamDateParts(instant);
  const utcDate = new Date(0);
  utcDate.setUTCFullYear(year, month - 1, day);
  const sundayBasedDay = utcDate.getUTCDay();
  return sundayBasedDay === 0 ? 7 : sundayBasedDay;
}

function vietnamDateParts(instant: Date): {
  year: number;
  month: number;
  day: number;
} {
  const parts = vietnamDateFormatter.formatToParts(instant);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  };
}
