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
