import {
  OTP_TTL_SECONDS,
  RESEND_INTERVAL_SECONDS,
  secondsByClock,
  secondsFromFreshCode,
} from './code-deadlines';
import { isCompleteOtp } from './otp-code';

// Task F2. Mã ca OT-nn là [đề xuất].
const AT = Date.parse('2026-11-02T10:00:00.000Z');
const iso = (seconds: number) => new Date(AT + seconds * 1000).toISOString();

describe('hằng phản chiếu API', () => {
  it('OT-01 10 phút và 60 giây', () => {
    expect([OTP_TTL_SECONDS, RESEND_INTERVAL_SECONDS]).toEqual([600, 60]);
  });
});

describe('secondsFromFreshCode', () => {
  it('OT-02 phản hồi mới: 600 giây dù đồng hồ máy lệch bao nhiêu', () => {
    for (const skew of [0, 3_600_000, -3_600_000]) {
      expect(secondsFromFreshCode(iso(600), iso(60), AT + skew)).toBe(600);
    }
  });

  it('OT-03 cặp mốc ngoài 1 đến 600 thì dùng đồng hồ máy', () => {
    expect(secondsFromFreshCode(iso(700), iso(60), AT)).toBe(600);
    expect(secondsFromFreshCode(iso(30), iso(100), AT)).toBe(30);
    expect(secondsFromFreshCode(iso(30), 'không phải ngày', AT)).toBe(30);
  });

  it('OT-04 biên 1 và 600 vẫn lấy theo cặp mốc', () => {
    expect(secondsFromFreshCode(iso(1), iso(60), AT + 500_000)).toBe(1);
    expect(secondsFromFreshCode(iso(600), iso(60), AT)).toBe(600);
  });
});

describe('secondsByClock', () => {
  it.each([
    [120, 120],
    [-5, 0],
    [9000, 600],
  ])('OT-05 kẹp 0 đến 600: mốc %i giây', (seconds, expected) => {
    expect(secondsByClock(iso(seconds), 600, AT)).toBe(expected);
  });

  it('OT-06 làm tròn lên, mốc rỗng hoặc lạ là 0', () => {
    expect(secondsByClock(iso(1.2), 600, AT)).toBe(2);
    expect(secondsByClock(null, 600, AT)).toBe(0);
    expect(secondsByClock('không phải ngày', 600, AT)).toBe(0);
  });
});

describe('isCompleteOtp', () => {
  it.each([
    ['012345', true],
    ['12345', false],
    ['1234567', false],
    ['12 456', false],
    ['abcdef', false],
    ['١٢٣٤٥٦', false],
  ])('OT-07 %s', (value, expected) => {
    expect(isCompleteOtp(value)).toBe(expected);
  });
});
