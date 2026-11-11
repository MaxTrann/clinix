import {
  addMonths,
  formatMonthLabel,
  isInMonth,
  lastDayOfMonth,
  monthGrid,
  monthStartOf,
} from './month';

// doctor F3: WL-04 (lưới tháng), WL-11 (biên tháng/năm). Mã ca là test case của PLAN doctor mục 7.12.
describe('monthStartOf, addMonths, lastDayOfMonth', () => {
  it('WL-11 ngày 1 của tháng chứa ngày bất kỳ', () => {
    expect(monthStartOf('2026-10-18')).toBe('2026-10-01');
    expect(monthStartOf('2026-12-31')).toBe('2026-12-01');
  });

  it('WL-11 qua năm: tháng 12 ⇒ tháng 1 năm sau và ngược lại', () => {
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2027-01-01', -1)).toBe('2026-12-01');
    expect(addMonths('2026-10-01', 15)).toBe('2028-01-01');
  });

  it('WL-11 ngày cuối tháng, kể cả tháng 2 năm nhuận và không nhuận', () => {
    expect(lastDayOfMonth('2026-10-01')).toBe('2026-10-31');
    expect(lastDayOfMonth('2026-11-01')).toBe('2026-11-30');
    expect(lastDayOfMonth('2028-02-01')).toBe('2028-02-29');
    expect(lastDayOfMonth('2027-02-01')).toBe('2027-02-28');
  });
});

describe('monthGrid', () => {
  it('WL-04 tháng 10/2026 (1/10 là thứ Năm, 31/10 là thứ Bảy): 5 tuần, 28/9 – 1/11', () => {
    const grid = monthGrid('2026-10-01');
    expect(grid.gridStart).toBe('2026-09-28');
    expect(grid.gridEnd).toBe('2026-11-01');
    expect(grid.weeks).toHaveLength(5);
    expect(grid.weeks[0][0]).toBe('2026-09-28');
    expect(grid.weeks[0][3]).toBe('2026-10-01');
    expect(grid.weeks[4][6]).toBe('2026-11-01');
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true);
  });

  it('WL-04 tháng bắt đầu đúng thứ Hai và kết thúc đúng Chủ nhật: không thừa tuần (2/2027 = 4 tuần)', () => {
    const grid = monthGrid('2027-02-01');
    expect(grid.gridStart).toBe('2027-02-01');
    expect(grid.gridEnd).toBe('2027-02-28');
    expect(grid.weeks).toHaveLength(4);
  });

  it('WL-11 trần 42 ngày (6 tuần) của API: tháng dài nhất vẫn ≤ 42 ngày', () => {
    // 1/8/2026 là thứ Bảy, 31/8 là thứ Hai ⇒ tuần đầu T2 27/7 … tuần cuối CN 6/9 = 6 tuần
    const grid = monthGrid('2026-08-01');
    expect(grid.weeks).toHaveLength(6);
    expect(grid.weeks.flat()).toHaveLength(42);
    expect(grid.gridStart).toBe('2026-07-27');
    expect(grid.gridEnd).toBe('2026-09-06');
  });

  it('WL-11 mọi tháng 2026–2028 đều ≤ 6 tuần', () => {
    for (let index = 0; index < 36; index += 1) {
      const start = addMonths('2026-01-01', index);
      expect(monthGrid(start).weeks.length).toBeLessThanOrEqual(6);
    }
  });
});

describe('nhãn và thuộc tháng', () => {
  it('nhãn "Tháng 10 năm 2026" như Figma 467:2, tháng một chữ số không có số 0 đầu', () => {
    expect(formatMonthLabel('2026-10-01')).toBe('Tháng 10 năm 2026');
    expect(formatMonthLabel('2026-03-01')).toBe('Tháng 3 năm 2026');
  });

  it('isInMonth: so tháng và năm', () => {
    expect(isInMonth('2026-10-31', '2026-10-01')).toBe(true);
    expect(isInMonth('2026-11-01', '2026-10-01')).toBe(false);
    expect(isInMonth('2025-10-15', '2026-10-01')).toBe(false);
  });
});
