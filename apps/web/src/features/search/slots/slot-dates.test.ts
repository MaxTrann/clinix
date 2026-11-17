import { describe, expect, it } from 'vitest';
import {
  dateAccessibleName,
  dateLabel,
  dayMonthLabel,
  longWeekday,
  monthLabel,
  shortWeekday,
  slotWindow,
  timeLabel,
  weekdayName,
} from './slot-dates';

// search PR-C2, mã ca SLT-01 đến SLT-06 (TRACKING search mục 10.4). Hàm thuần của dải ngày và giờ khung giờ; chạy cả với `TZ=UTC` và `TZ=America/New_York`
// (kết quả KHÔNG được phụ thuộc múi giờ máy). 17/11/2026 là Thứ Ba.

describe('slotWindow (SLT-01)', () => {
  it('SLT-01 bảy ngày liên tiếp bắt đầu từ hôm nay, thứ tự tăng', () => {
    expect(slotWindow('2026-11-17')).toEqual([
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
      '2026-11-23',
    ]);
  });

  it('SLT-01 qua ranh tháng, năm và năm nhuận không lệch ngày', () => {
    expect(slotWindow('2026-12-28').at(-1)).toBe('2027-01-03');
    expect(slotWindow('2026-02-26').at(-1)).toBe('2026-03-04');
    expect(slotWindow('2028-02-26')).toContain('2028-02-29');
    expect(slotWindow('2028-02-26').at(-1)).toBe('2028-03-03');
    expect(slotWindow('2026-11-17')).toHaveLength(7);
  });
});

describe('nhãn thứ và ngày (SLT-03, SLT-04)', () => {
  it('SLT-03 nhãn ngắn T2…T7 và CN, tên dài Thứ Hai…Chủ nhật, theo đúng ngày (16/11/2026 là Thứ Hai)', () => {
    const days = slotWindow('2026-11-16');
    expect(days.map(shortWeekday)).toEqual([
      'T2',
      'T3',
      'T4',
      'T5',
      'T6',
      'T7',
      'CN',
    ]);
    expect(days.map(longWeekday)).toEqual([
      'Thứ Hai',
      'Thứ Ba',
      'Thứ Tư',
      'Thứ Năm',
      'Thứ Sáu',
      'Thứ Bảy',
      'Chủ nhật',
    ]);
  });

  it('SLT-03 `thuNghi` của API (thứ ISO 1 đến 7) ⇒ tên thứ, 7 là Chủ nhật', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(weekdayName)).toEqual([
      'Thứ Hai',
      'Thứ Ba',
      'Thứ Tư',
      'Thứ Năm',
      'Thứ Sáu',
      'Thứ Bảy',
      'Chủ nhật',
    ]);
  });

  it('SLT-04 ngày/tháng không số 0 đứng đầu; nhãn tháng "Th9" và "Th11"', () => {
    expect(dayMonthLabel('2026-11-05')).toBe('5/11');
    expect(dayMonthLabel('2026-12-31')).toBe('31/12');
    expect(monthLabel('2026-09-05')).toBe('Th9');
    expect(monthLabel('2026-11-17')).toBe('Th11');
  });

  it('SLT-04 "Hôm nay", "Ngày mai", rồi thứ; ngày mai qua ranh tháng', () => {
    expect(dateLabel('2026-11-17', '2026-11-17')).toBe('Hôm nay 17/11');
    expect(dateLabel('2026-11-18', '2026-11-17')).toBe('Ngày mai 18/11');
    expect(dateLabel('2026-11-19', '2026-11-17')).toBe('T5 19/11');
    expect(dateLabel('2026-12-01', '2026-11-30')).toBe('Ngày mai 1/12');
    expect(dateLabel('2026-11-22', '2026-11-17')).toBe('CN 22/11');
  });

  it('SLT-04 tên truy cập của thẻ ngày: "Hôm nay, Thứ Ba 17/11" và "Thứ Tư 18/11"', () => {
    expect(dateAccessibleName('2026-11-17', '2026-11-17')).toBe(
      'Hôm nay, Thứ Ba 17/11',
    );
    expect(dateAccessibleName('2026-11-18', '2026-11-17')).toBe('Thứ Tư 18/11');
  });
});

describe('timeLabel: giờ Việt Nam từ ISO UTC (SLT-05, SLT-06)', () => {
  it('SLT-05 02:30Z là 09:30 giờ Việt Nam, không theo múi giờ máy', () => {
    expect(timeLabel('2026-11-18T02:30:00.000Z')).toBe('09:30');
    expect(timeLabel('2026-11-18T05:00:00.000Z')).toBe('12:00');
    expect(timeLabel('2026-11-18T09:45:00.000Z')).toBe('16:45');
  });

  it('SLT-06 ranh nửa đêm Việt Nam: 16:59Z là 23:59, 17:00Z là 00:00 (không phải "24:00")', () => {
    expect(timeLabel('2026-11-17T16:59:00.000Z')).toBe('23:59');
    expect(timeLabel('2026-11-17T17:00:00.000Z')).toBe('00:00');
    expect(timeLabel('2026-11-17T17:30:00.000Z')).toBe('00:30');
  });
});
