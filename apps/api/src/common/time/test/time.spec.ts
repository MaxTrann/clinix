import { afterEach, describe, expect, it, vi } from 'vitest';
import { nowVN, todayVN, weekdayVN } from '../time.js';

describe('giờ Việt Nam', () => {
  afterEach(() => vi.useRealTimers());

  it('(BS-37) nowVN đọc instant hiện tại từ đồng hồ ứng dụng', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T16:59:59.000Z'));

    expect(nowVN().toISOString()).toBe('2026-10-27T16:59:59.000Z');
  });

  it('(BS-37) todayVN đổi ngày đúng tại 00:00 giờ Việt Nam', () => {
    expect(todayVN(new Date('2026-10-27T16:59:59.000Z'))).toBe('2026-10-27');
    expect(todayVN(new Date('2026-10-27T17:00:00.000Z'))).toBe('2026-10-28');
  });

  it('(BS-37) weekdayVN khớp ISO weekday của ngày lịch Việt Nam ở hai phía nửa đêm', () => {
    expect(weekdayVN(new Date('2026-10-27T16:59:59.000Z'))).toBe(2);
    expect(weekdayVN(new Date('2026-10-27T17:00:00.000Z'))).toBe(3);
  });

  it('(BS-37) weekdayVN ánh xạ đủ thứ Hai đến Chủ nhật theo schema 1–7', () => {
    const instantsAtNoonUTC = [
      '2026-10-26T05:00:00.000Z',
      '2026-10-27T05:00:00.000Z',
      '2026-10-28T05:00:00.000Z',
      '2026-10-29T05:00:00.000Z',
      '2026-10-30T05:00:00.000Z',
      '2026-10-31T05:00:00.000Z',
      '2026-11-01T05:00:00.000Z',
    ];

    expect(
      instantsAtNoonUTC.map((instant) => weekdayVN(new Date(instant))),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
