import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clockOffsetMs,
  formatHoldTime,
  holdLevel,
  holdRemainingSeconds,
} from './hold-countdown';

// booking F6: hàm thuần của đồng hồ giữ chỗ. WPF6-01…WPF6-06 là [đề xuất] (TRACKING booking 3.49.3); WZ-10 (đếm ngược theo giờ máy chủ, về 0). Hàm thuần: KHÔNG đọc đồng hồ máy,
// nên test không dùng đồng hồ giả trừ ca khẳng định đúng điều đó.
afterEach(() => {
  vi.useRealTimers();
});

const SERVER_NOW = Date.parse('2026-11-23T08:00:00.000Z');
const DEADLINE = '2026-11-23T08:15:00.000Z';
const deadlineMs = Date.parse(DEADLINE);

describe('WPF6-01 số giây còn lại = hạn − giờ máy chủ, làm tròn LÊN', () => {
  it('đúng 15 phút ra 900; mỗi giây trôi qua giảm 1', () => {
    expect(holdRemainingSeconds(DEADLINE, SERVER_NOW)).toBe(900);
    expect(holdRemainingSeconds(DEADLINE, SERVER_NOW + 1000)).toBe(899);
    expect(holdRemainingSeconds(DEADLINE, SERVER_NOW + 61_000)).toBe(839);
  });

  it('phần lẻ làm tròn LÊN: còn 899,001 giây ra 900 (số hiện "15:00" chứ không phải "14:59")', () => {
    expect(holdRemainingSeconds(DEADLINE, deadlineMs - 899_001)).toBe(900);
    expect(holdRemainingSeconds(DEADLINE, deadlineMs - 899_000)).toBe(899);
  });

  it('không đọc đồng hồ máy: đổi giờ máy thì kết quả không đổi', () => {
    vi.useFakeTimers({ now: Date.parse('2030-01-01T00:00:00.000Z') });
    const first = holdRemainingSeconds(DEADLINE, SERVER_NOW);
    vi.setSystemTime(Date.parse('2020-01-01T00:00:00.000Z'));
    expect(holdRemainingSeconds(DEADLINE, SERVER_NOW)).toBe(first);
  });
});

describe('WPF6-02 biên 0', () => {
  it('đúng mốc là hết (nửa mở, Q2): còn 0 ms ra 0', () => {
    expect(holdRemainingSeconds(DEADLINE, deadlineMs)).toBe(0);
  });

  it('còn 1 ms và 999 ms ra 1 (bắt `floor` và `round`); 1000 ms ra 1; 1001 ms ra 2', () => {
    expect(holdRemainingSeconds(DEADLINE, deadlineMs - 1)).toBe(1);
    expect(holdRemainingSeconds(DEADLINE, deadlineMs - 999)).toBe(1);
    expect(holdRemainingSeconds(DEADLINE, deadlineMs - 1000)).toBe(1);
    expect(holdRemainingSeconds(DEADLINE, deadlineMs - 1001)).toBe(2);
  });

  it('đã qua hạn (1 ms, 1 giây, cả ngày) ra 0, KHÔNG âm', () => {
    expect(holdRemainingSeconds(DEADLINE, deadlineMs + 1)).toBe(0);
    expect(holdRemainingSeconds(DEADLINE, deadlineMs + 1000)).toBe(0);
    expect(holdRemainingSeconds(DEADLINE, deadlineMs + 86_400_000)).toBe(0);
  });
});

describe('WPF6-03 hạn null', () => {
  it('không có hạn ⇒ null (không phải 0: không bao giờ hết hạn)', () => {
    expect(holdRemainingSeconds(null, SERVER_NOW)).toBeNull();
  });
});

describe('WPF6-04 giờ máy lệch giờ máy chủ', () => {
  const MACHINE_NOW = Date.parse('2026-11-23T08:00:00.000Z');

  it('chênh = giờ máy chủ trừ giờ máy lúc nhận (dấu đúng)', () => {
    expect(clockOffsetMs('2026-11-23T08:01:30.000Z', MACHINE_NOW)).toBe(90_000);
    expect(clockOffsetMs('2026-11-23T07:58:30.000Z', MACHINE_NOW)).toBe(
      -90_000,
    );
    expect(clockOffsetMs('2026-11-23T08:00:00.000Z', MACHINE_NOW)).toBe(0);
  });

  it.each([
    ['máy chậm 90 giây', 90_000],
    ['máy nhanh 90 giây', -90_000],
    ['hai đồng hồ trùng', 0],
  ])('%s: cùng số giây còn lại như khi hai đồng hồ trùng', (_name, skew) => {
    // Máy chủ ghi "bây giờ" = giờ máy + skew; hạn = giờ máy chủ + 15 phút
    const serverTime = new Date(MACHINE_NOW + skew).toISOString();
    const deadline = new Date(MACHINE_NOW + skew + 900_000).toISOString();
    const offset = clockOffsetMs(serverTime, MACHINE_NOW);
    // Lúc nhận
    expect(holdRemainingSeconds(deadline, MACHINE_NOW + offset)).toBe(900);
    // 61 giây sau theo đồng hồ MÁY
    expect(holdRemainingSeconds(deadline, MACHINE_NOW + 61_000 + offset)).toBe(
      839,
    );
  });

  it('bỏ chênh thì SAI rõ rệt (đối chứng): máy chậm 90 giây tính ra 990 thay vì 900', () => {
    const deadline = new Date(MACHINE_NOW + 90_000 + 900_000).toISOString();
    expect(holdRemainingSeconds(deadline, MACHINE_NOW)).toBe(990);
  });
});

describe('WPF6-05 formatHoldTime ("mm:ss")', () => {
  it.each([
    [0, '00:00'],
    [1, '00:01'],
    [59, '00:59'],
    [60, '01:00'],
    [61, '01:01'],
    [899, '14:59'],
    [900, '15:00'],
    [3599, '59:59'],
    [3600, '60:00'],
    [4500, '75:00'],
  ])('%i giây ⇒ %s (phút không bị kẹp ở 59)', (seconds, text) => {
    expect(formatHoldTime(seconds)).toBe(text);
  });
});

describe('WPF6-06 holdLevel: mốc 5 phút, 1 phút, hết giờ', () => {
  it.each([
    [900, 'plenty'],
    [301, 'plenty'],
    [300, 'within5'],
    [61, 'within5'],
    [60, 'within1'],
    [1, 'within1'],
    [0, 'ended'],
  ])('%i giây ⇒ %s', (seconds, level) => {
    expect(holdLevel(seconds)).toBe(level);
  });
});
