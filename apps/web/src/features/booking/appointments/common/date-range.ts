// Khoảng ngày của bộ lọc "Từ ngày, Đến ngày" (booking F1 viết trong `patient/list-query-state.ts`, chuyển lên `common/` ở F8 để Lễ tân dùng lại).
// Ngày là chuỗi `YYYY-MM-DD` (ngày Việt Nam, không qua `Date`); '' là chưa chọn.
export interface DateRange {
  from: string;
  to: string;
}

// Ngày là chuỗi `YYYY-MM-DD` nên so sánh chuỗi chính là so sánh ngày; ô trống thì không ràng buộc
export function isDateRangeValid(range: DateRange): boolean {
  return range.from === '' || range.to === '' || range.to >= range.from;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Ngày lịch có thật (không `2026-13-45`, không `2026-02-30`); dựng ở UTC trên ba số năm-tháng-ngày, không đọc múi giờ của máy (booking F10 viết ở `admin/admin-query-state.ts`, chuyển lên `common/` ở F11:
// Quản trị viên và Bác sĩ cùng kiểm ngày đọc từ URL, là dữ liệu người dùng sửa được).
export function isCalendarDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
