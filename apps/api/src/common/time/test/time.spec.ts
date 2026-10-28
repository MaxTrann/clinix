import { afterEach, describe, expect, it, vi } from 'vitest';
import { nowVN, todayVN, toSecond, weekdayVN } from '../time.js';

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

// Mã (TS-nn) là [đề xuất]: plan chưa có mã test case riêng cho toSecond (dùng chung cho SessionService và OtpService).
describe('toSecond — cắt mili giây xuống giây', () => {
  const isoOf = (instants: string[]) =>
    instants.map((instant) => toSecond(new Date(instant)).toISOString());

  it('(TS-01) cắt …001, …500, …999 ms thành …000, không làm tròn lên giây kế', () => {
    expect(
      isoOf([
        '2026-10-27T01:00:00.001Z',
        '2026-10-27T01:00:00.500Z',
        '2026-10-27T01:00:00.999Z',
      ]),
    ).toEqual([
      '2026-10-27T01:00:00.000Z',
      '2026-10-27T01:00:00.000Z',
      '2026-10-27T01:00:00.000Z',
    ]);
  });

  it('(TS-01) giờ biên 23:59:59.999 vẫn ở trong giây đó, không sang ngày, tháng hay năm kế (kể cả 29/2)', () => {
    expect(
      isoOf([
        '2026-10-27T23:59:59.999Z',
        '2026-12-31T23:59:59.999Z',
        '2028-02-29T23:59:59.999Z',
      ]),
    ).toEqual([
      '2026-10-27T23:59:59.000Z',
      '2026-12-31T23:59:59.000Z',
      '2028-02-29T23:59:59.000Z',
    ]);
  });

  it('(TS-02) đầu vào đã tròn giây thì giữ nguyên giá trị', () => {
    const instants = [
      '2026-10-27T01:00:00.000Z',
      '1970-01-01T00:00:00.000Z',
      '2099-12-31T23:59:59.000Z',
    ];
    expect(isoOf(instants)).toEqual(instants);
  });

  it('(TS-03) trả về Date MỚI (kể cả khi đã tròn giây) và không sửa đầu vào', () => {
    const fractional = new Date('2026-10-27T01:00:00.999Z');
    const roundedFractional = toSecond(fractional);
    expect(roundedFractional).not.toBe(fractional);
    expect(fractional.toISOString()).toBe('2026-10-27T01:00:00.999Z');

    const exact = new Date('2026-10-27T01:00:00.000Z');
    const roundedExact = toSecond(exact);
    expect(roundedExact).not.toBe(exact);
    expect(roundedExact.getTime()).toBe(exact.getTime());
    roundedExact.setUTCFullYear(2000); // sửa kết quả không được làm đổi đầu vào
    expect(exact.toISOString()).toBe('2026-10-27T01:00:00.000Z');
  });

  it('(TS-04) trước 1970 vẫn làm tròn XUỐNG (về phía quá khứ), không về phía 0', () => {
    expect(
      isoOf([
        '1969-12-31T23:59:59.999Z', // -1 ms
        '1969-12-31T23:59:58.001Z',
        '1970-01-01T00:00:00.999Z',
        '1970-01-01T00:00:00.000Z',
      ]),
    ).toEqual([
      '1969-12-31T23:59:59.000Z',
      '1969-12-31T23:59:58.000Z',
      '1970-01-01T00:00:00.000Z',
      '1970-01-01T00:00:00.000Z',
    ]);
  });

  it('(TS-05) kết quả không phụ thuộc múi giờ của máy chạy (kể cả múi giờ lệch 45 phút và lệch âm 30 phút)', () => {
    const instant = new Date('2026-10-27T16:59:59.999Z');
    const originalTz = process.env.TZ;
    try {
      // [múi giờ, getTimezoneOffset() tại thời điểm đó]: St. John's đang giờ mùa hè (UTC-02:30) vào ngày 27/10/2026
      const zones: [string, number][] = [
        ['UTC', 0],
        ['Asia/Ho_Chi_Minh', -420],
        ['Asia/Kathmandu', -345],
        ['America/St_Johns', 150],
      ];
      const results = zones.map(([zone, expectedOffset]) => {
        process.env.TZ = zone;
        // bảo đảm việc đổi TZ có tác dụng thật, không thì test này chỉ là hình thức
        expect(instant.getTimezoneOffset()).toBe(expectedOffset);
        return toSecond(instant).toISOString();
      });
      expect(new Set(results)).toEqual(new Set(['2026-10-27T16:59:59.000Z']));
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });
});
