import { formatRange } from './range';

// UX1-01 đến UX1-04 (doctor UX1, G6): khoảng số in có khoảng trắng hai bên dấu gạch giữa (en dash), không dính sát số.

describe('formatRange', () => {
  it('UX1-01 số: "1 – 4", "11 – 20" (có khoảng trắng hai bên, dấu gạch giữa U+2013)', () => {
    expect(formatRange(1, 4)).toBe('1 – 4');
    expect(formatRange(11, 20)).toBe('11 – 20');
    expect(formatRange(1, 4)).toContain('–');
  });

  it('UX1-02 giờ ca: "08:00 – 12:00", "13:30 – 17:00"', () => {
    expect(formatRange('08:00', '12:00')).toBe('08:00 – 12:00');
    expect(formatRange('13:30', '17:00')).toBe('13:30 – 17:00');
  });

  it('UX1-03 biên: hai đầu bằng nhau vẫn in đủ ("11 – 11"), số 0 là giá trị hợp lệ chứ không phải "rỗng"', () => {
    expect(formatRange(11, 11)).toBe('11 – 11');
    expect(formatRange(0, 5)).toBe('0 – 5');
    expect(formatRange(0, 0)).toBe('0 – 0');
  });

  it('UX1-04 ca âm: thiếu một đầu (null, undefined, chuỗi rỗng) ⇒ null, KHÔNG in "null – 5"', () => {
    expect(formatRange(null, '12:00')).toBeNull();
    expect(formatRange('08:00', null)).toBeNull();
    expect(formatRange(undefined, 5)).toBeNull();
    expect(formatRange(1, undefined)).toBeNull();
    expect(formatRange('', '12:00')).toBeNull();
    expect(formatRange('08:00', '')).toBeNull();
    expect(formatRange(null, null)).toBeNull();
  });
});
