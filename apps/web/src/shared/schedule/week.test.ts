import {
  addDays,
  formatWeekRange,
  formatWeekdayDate,
  isoWeekday,
  todayVn,
  weekDays,
  weekStartOf,
  weekdayLabel,
} from './week';

// doctor F2: WL-03 (tuần T2–CN theo giờ VN), WL-11 (biên tuần: chủ nhật, đổi tháng/năm). Mã ca là test case của PLAN doctor mục 7.12.
describe('todayVn', () => {
  it('WL-11 17:30 UTC đã là ngày hôm sau ở Việt Nam', () => {
    expect(todayVn(new Date('2026-10-18T17:30:00Z'))).toBe('2026-10-19');
  });

  it('WL-11 16:59 UTC vẫn là hôm nay ở Việt Nam (ngay trước nửa đêm)', () => {
    expect(todayVn(new Date('2026-10-18T16:59:59Z'))).toBe('2026-10-18');
  });
});

describe('weekStartOf', () => {
  it('WL-03 giữa tuần: về thứ Hai', () => {
    expect(weekStartOf('2026-10-14')).toBe('2026-10-12');
  });

  it('WL-03 đúng thứ Hai: giữ nguyên', () => {
    expect(weekStartOf('2026-10-12')).toBe('2026-10-12');
  });

  it('WL-11 chủ nhật thuộc tuần của thứ Hai TRƯỚC nó, không phải tuần sau', () => {
    expect(weekStartOf('2026-10-18')).toBe('2026-10-12');
  });

  it('WL-11 tuần giữa hai tháng', () => {
    expect(weekStartOf('2026-11-01')).toBe('2026-10-26');
    expect(weekDays('2026-10-26')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });

  it('WL-11 tuần giữa hai năm', () => {
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28');
    expect(weekDays('2026-12-28')[6]).toBe('2027-01-03');
  });

  it('WL-11 năm nhuận: 29/02/2028 là thứ Ba', () => {
    expect(weekStartOf('2028-02-29')).toBe('2028-02-28');
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01');
  });
});

describe('addDays, isoWeekday', () => {
  it('WL-03 chuyển tuần: cộng/trừ 7 ngày', () => {
    expect(addDays('2026-10-12', 7)).toBe('2026-10-19');
    expect(addDays('2026-10-12', -7)).toBe('2026-10-05');
  });

  it('isoWeekday: 1 = thứ Hai, 7 = Chủ nhật', () => {
    expect(isoWeekday('2026-10-12')).toBe(1);
    expect(isoWeekday('2026-10-18')).toBe(7);
  });

  it('ngày sai định dạng thì ném lỗi (không đoán)', () => {
    expect(() => addDays('12/10/2026', 1)).toThrow(RangeError);
  });
});

describe('nhãn', () => {
  it('WL-03 nhãn thứ và khoảng tuần như Figma 466:2', () => {
    expect(weekdayLabel('2026-10-12')).toBe('Thứ 2');
    expect(weekdayLabel('2026-10-17')).toBe('Thứ 7');
    expect(weekdayLabel('2026-10-18')).toBe('CN');
    expect(formatWeekRange('2026-10-12')).toBe('12/10 – 18/10/2026');
    expect(formatWeekdayDate('2026-10-12')).toBe('Thứ 2, 12/10/2026');
  });
});
