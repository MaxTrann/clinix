import { describe, expect, it } from 'vitest';
import { isDateRangeValid } from './date-range';

// booking F1 viết (LHL-18), chuyển lên `common/` ở F8 cùng `date-range.ts`; nội dung ca giữ nguyên.
describe('booking F1 — khoảng ngày', () => {
  it('LHL-18 khoảng ngày: thiếu một đầu, hai đầu bằng nhau và đúng thứ tự là hợp lệ; đảo ngược là không', () => {
    expect(isDateRangeValid({ from: '', to: '' })).toBe(true);
    expect(isDateRangeValid({ from: '2026-10-01', to: '' })).toBe(true);
    expect(isDateRangeValid({ from: '', to: '2026-10-01' })).toBe(true);
    expect(isDateRangeValid({ from: '2026-10-20', to: '2026-10-20' })).toBe(
      true,
    );
    expect(isDateRangeValid({ from: '2026-10-19', to: '2026-10-20' })).toBe(
      true,
    );
    expect(isDateRangeValid({ from: '2026-10-20', to: '2026-10-19' })).toBe(
      false,
    );
    // So sánh chuỗi là so sánh ngày, kể cả qua tháng và qua năm
    expect(isDateRangeValid({ from: '2026-12-31', to: '2027-01-01' })).toBe(
      true,
    );
    expect(isDateRangeValid({ from: '2027-01-01', to: '2026-12-31' })).toBe(
      false,
    );
  });
});
