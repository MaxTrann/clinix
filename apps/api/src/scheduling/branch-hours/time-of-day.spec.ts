import {
  formatHHMM,
  formatRange,
  isoWeekdayOf,
  secondsOfDayVN,
} from './time-of-day.js';

// Doctor P2 — hàm giờ trong ngày (nền cho GC-*, SG-*; PC-26 so với MySQL nằm ở branch-hours.reader.int-spec.ts).
describe('time-of-day', () => {
  it('secondsOfDayVN: tính theo giờ VN, không phụ thuộc múi giờ máy; nửa đêm VN = 17:00Z hôm trước', () => {
    expect(secondsOfDayVN(new Date('2026-11-10T08:00:00+07:00'))).toBe(28800);
    expect(secondsOfDayVN(new Date('2026-11-09T17:00:00Z'))).toBe(0);
    expect(secondsOfDayVN(new Date('2026-11-10T16:59:59Z'))).toBe(86399);
    expect(secondsOfDayVN(new Date('2026-11-10T08:00:00.999+07:00'))).toBe(
      28800,
    );
  });

  it('isoWeekdayOf: thứ ISO của ngày lịch (Thứ Hai = 1 … Chủ Nhật = 7)', () => {
    expect(isoWeekdayOf('2026-11-09')).toBe(1);
    expect(isoWeekdayOf('2026-11-10')).toBe(2);
    expect(isoWeekdayOf('2026-11-15')).toBe(7);
  });

  it('isoWeekdayOf: ngày sai dạng ⇒ ném lỗi', () => {
    for (const bad of ['2026-1-10', '10/11/2026', '', '2026-11-10T00:00'])
      expect(() => isoWeekdayOf(bad), bad).toThrow(/YYYY-MM-DD/);
  });

  it('formatHHMM / formatRange: bỏ phần giây, đệm số 0', () => {
    expect(formatHHMM(0)).toBe('00:00');
    expect(formatHHMM(27000)).toBe('07:30');
    expect(formatHHMM(86399)).toBe('23:59');
    expect(formatRange({ tuGiay: 27000, denGiay: 39600 })).toEqual({
      tu: '07:30',
      den: '11:00',
    });
  });
});
