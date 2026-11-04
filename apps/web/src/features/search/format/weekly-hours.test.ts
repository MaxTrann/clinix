import { describe, expect, it } from 'vitest';
import type { WeekdayHours } from '../api/search-types';
import { formatDayHours, groupWeeklyHours } from './weekly-hours';

const open = (thuTrongTuan: number, chieu = true): WeekdayHours => ({
  thuTrongTuan,
  hoatDong: {
    sang: { tu: '08:00', den: '12:00' },
    chieu: chieu ? { tu: '13:00', den: '17:00' } : null,
  },
});
const closed = (thuTrongTuan: number): WeekdayHours => ({
  thuTrongTuan,
  hoatDong: null,
});

describe('search F2 — giờ nhận khám trong tuần (phần định dạng của TCN-13)', () => {
  it('hiện cả hai khoảng; chỉ một khoảng thì chỉ hiện khoảng đó', () => {
    expect(formatDayHours(open(1))).toBe('08:00 – 12:00, 13:00 – 17:00');
    expect(formatDayHours(open(6, false))).toBe('08:00 – 12:00');
  });

  it('ngày nghỉ hoặc chưa khai báo (hoatDong null) ⇒ "Nghỉ"', () => {
    expect(formatDayHours(closed(7))).toBe('Nghỉ');
    expect(
      formatDayHours({
        thuTrongTuan: 7,
        hoatDong: { sang: null, chieu: null },
      }),
    ).toBe('Nghỉ');
  });

  it('gộp các thứ liền nhau cùng giờ như chân trang Figma', () => {
    const week = [
      open(1),
      open(2),
      open(3),
      open(4),
      open(5),
      open(6, false),
      closed(7),
    ];
    expect(groupWeeklyHours(week)).toEqual([
      { label: 'Thứ 2 – Thứ 6', text: '08:00 – 12:00, 13:00 – 17:00' },
      { label: 'Thứ 7', text: '08:00 – 12:00' },
      { label: 'Chủ nhật', text: 'Nghỉ' },
    ]);
  });

  it('thứ cùng giờ nhưng không liền nhau thì không gộp; đầu vào xáo trộn vẫn đúng thứ tự', () => {
    const week = [open(4), closed(3), open(1), open(2)];
    expect(groupWeeklyHours(week).map((group) => group.label)).toEqual([
      'Thứ 2 – Thứ 3',
      'Thứ 4',
      'Thứ 5',
    ]);
  });
});
