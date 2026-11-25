// Thời gian của một thông báo theo giờ Việt Nam (notification F2, PLAN 5.10; WTB-06): tuyệt đối "08:05 20/11/2026" và tương đối "5 phút trước".
// API trả ISO UTC; đổi sang `Asia/Ho_Chi_Minh` bằng `Intl` nên không phụ thuộc múi giờ của máy người dùng.

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatAbsolute(iso: string): string {
  const parts = Object.fromEntries(
    PARTS.formatToParts(new Date(iso)).map(({ type, value }) => [type, value]),
  );
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}/${parts.year}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Thời gian tương đối so với `now`; quá 7 ngày thì `null` (chỉ hiện giờ tuyệt đối). Thời điểm ở tương lai (lệch đồng hồ) tính là "Vừa xong". */
export function formatRelative(iso: string, now: number): string | null {
  const elapsed = now - Date.parse(iso);
  if (elapsed < MINUTE) return 'Vừa xong';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} phút trước`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} giờ trước`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} ngày trước`;
  return null;
}
