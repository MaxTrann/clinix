import { describe, expect, it } from 'vitest';
import {
  formatCount,
  formatLongDate,
  formatPercent,
  formatRange,
} from './format';

// dashboard F1 — phần định dạng của DWB-06 (PLAN dashboard 7.6; T5): chỉ định dạng số máy chủ trả, không làm tròn lại.

describe('dashboard F1 — định dạng', () => {
  it('DWB-06: phần trăm một chữ số, dấu phẩy thập phân; `null` ⇒ "—"', () => {
    expect(formatPercent(33.3)).toBe('33,3%');
    expect(formatPercent(100)).toBe('100,0%');
    expect(formatPercent(0)).toBe('0,0%');
    expect(formatPercent(6.3)).toBe('6,3%');
    expect(formatPercent(null)).toBe('—');
  });

  it('số đếm có dấu chấm ngăn nghìn', () => {
    expect(formatCount(12500)).toBe('12.500');
    expect(formatCount(0)).toBe('0');
  });

  it('ngày dài theo Figma và khoảng ngày', () => {
    expect(formatLongDate('2026-10-18')).toBe('Chủ Nhật, 18 tháng 10, 2026');
    expect(formatLongDate('2026-12-04')).toBe('Thứ Sáu, 4 tháng 12, 2026');
    expect(formatRange('2026-10-12', '2026-10-18')).toBe(
      '12/10/2026 – 18/10/2026',
    );
  });
});
