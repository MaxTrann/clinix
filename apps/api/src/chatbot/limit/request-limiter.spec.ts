import {
  DEFAULT_REQUEST_LIMITS,
  normalizeIp,
  RequestLimiter,
} from './request-limiter.js';

// chatbot B1 — GHT-01 đến GHT-05, GHT-07 ở mức bộ giới hạn ghép (IP + suất đồng thời; PLAN chatbot 5.10, 7.5).
// GHT-06 (đã chạm trần rồi gửi câu khẩn cấp) là e2e của chatbot B3: ở B1 chỉ khoá phần của mình (hàm khẩn cấp không biết bộ giới hạn, xem safety.architecture.spec.ts).
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const DAY = 24 * 60 * MINUTE;

function makeClock(start = 0) {
  let now = start;
  return {
    now: () => now,
    set: (value: number) => {
      now = value;
    },
  };
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('chatbot B1 — RequestLimiter: giới hạn theo IP', () => {
  it('B1-GHT: mặc định đúng PLAN 5.10, 5.13 (5 mỗi phút, 50 mỗi ngày, 3 suất, trần 10.000 IP)', () => {
    expect(DEFAULT_REQUEST_LIMITS).toEqual({
      ipPerMinute: 5,
      ipPerDay: 50,
      maxConcurrent: 3,
      maxTrackedIps: 10_000,
    });
  });

  it('GHT-01: câu thứ 6 trong 60 giây bị chặn kèm số giây chờ', () => {
    const clock = makeClock();
    const limiter = new RequestLimiter({ now: clock.now });
    for (let second = 0; second < 5; second += 1) {
      clock.set(second * SECOND);
      expect(limiter.checkIp('203.0.113.7')).toEqual({ allowed: true });
    }
    clock.set(10 * SECOND);
    expect(limiter.checkIp('203.0.113.7')).toEqual({
      allowed: false,
      reason: 'PER_MINUTE',
      retryAfterSeconds: 50,
    });
  });

  it('GHT-02: qua cửa sổ trượt thì được gửi lại (đúng mốc 60 giây)', () => {
    const clock = makeClock();
    const limiter = new RequestLimiter({ now: clock.now });
    for (let second = 0; second < 5; second += 1) {
      clock.set(second * SECOND);
      limiter.checkIp('203.0.113.7');
    }
    clock.set(MINUTE - 1);
    expect(limiter.checkIp('203.0.113.7').allowed).toBe(false);
    clock.set(MINUTE);
    expect(limiter.checkIp('203.0.113.7')).toEqual({ allowed: true });
  });

  it('GHT-03: câu thứ 51 trong 24 giờ bị chặn theo luật ngày; qua 24 giờ thì được', () => {
    const clock = makeClock();
    const limiter = new RequestLimiter({ now: clock.now });
    for (let index = 0; index < 50; index += 1) {
      clock.set(index * 13 * SECOND);
      expect(limiter.checkIp('203.0.113.7')).toEqual({ allowed: true });
    }
    clock.set(50 * 13 * SECOND);
    expect(limiter.checkIp('203.0.113.7')).toEqual({
      allowed: false,
      reason: 'PER_DAY',
      retryAfterSeconds: DAY / SECOND - 50 * 13,
    });
    clock.set(DAY);
    expect(limiter.checkIp('203.0.113.7')).toEqual({ allowed: true });
  });

  it('GHT-04: hai IP đếm riêng', () => {
    const limiter = new RequestLimiter({ now: () => 0 });
    for (let index = 0; index < 5; index += 1) limiter.checkIp('203.0.113.7');
    expect(limiter.checkIp('203.0.113.7').allowed).toBe(false);
    expect(limiter.checkIp('203.0.113.8')).toEqual({ allowed: true });
  });

  it('GHT-04: cùng một máy viết hai dạng (IPv4 nhúng IPv6, hoa thường, vùng `%`) thì chung một bộ đếm', () => {
    const limiter = new RequestLimiter({
      ipPerMinute: 1,
      ipPerDay: 50,
      now: () => 0,
    });
    expect(limiter.checkIp('203.0.113.7').allowed).toBe(true);
    expect(limiter.checkIp('::ffff:203.0.113.7').allowed).toBe(false);
    expect(limiter.checkIp('::FFFF:203.0.113.7').allowed).toBe(false);
    expect(limiter.checkIp('2001:DB8::1').allowed).toBe(true);
    expect(limiter.checkIp('2001:db8::1%eth0').allowed).toBe(false);
    expect(limiter.trackedIps).toBe(2);
  });

  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['  ::FFFF:10.0.0.1 ', '10.0.0.1'],
    ['2001:DB8::1%eth0', '2001:db8::1'],
    ['::1', '::1'],
    ['', 'unknown'],
    ['   ', 'unknown'],
    ['%eth0', 'unknown'],
    [undefined, 'unknown'],
    [null, 'unknown'],
  ] as const)('GHT-04: normalizeIp(%j) = %j', (input, expected) => {
    expect(normalizeIp(input)).toBe(expected);
  });

  it('GHT-04: IP thiếu hay rỗng dùng chung một khoá `unknown` (không bỏ qua giới hạn)', () => {
    const limiter = new RequestLimiter({ ipPerMinute: 1, now: () => 0 });
    expect(limiter.checkIp(undefined).allowed).toBe(true);
    expect(limiter.checkIp('').allowed).toBe(false);
  });

  it('GHT-04: khoá IP quá dài bị cắt (không để chuỗi lớn nằm trong bộ nhớ)', () => {
    expect(normalizeIp('1'.repeat(500)).length).toBe(64);
  });

  it('GHT-05: kiểm và ghi là MỘT đoạn đồng bộ: nhiều lời gọi trong cùng một lượt chạy, đúng 5 lời được nhận', async () => {
    const limiter = new RequestLimiter({ now: () => 0 });
    expect(limiter.checkIp('203.0.113.9')).not.toBeInstanceOf(Promise);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        Promise.resolve().then(() => limiter.checkIp('203.0.113.50')),
      ),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
  });

  it('GHT-07: nhiều IP thì bản đồ không vượt trần và mục hết hạn 24 giờ bị dọn', () => {
    const clock = makeClock();
    const limiter = new RequestLimiter({ maxTrackedIps: 100, now: clock.now });
    for (let index = 0; index < 250; index += 1) {
      clock.set(index);
      limiter.checkIp(`10.0.${Math.floor(index / 250)}.${index % 250}`);
      expect(limiter.trackedIps).toBeLessThanOrEqual(100);
    }
    expect(limiter.trackedIps).toBe(100);
    clock.set(DAY + 1000);
    limiter.checkIp('198.51.100.1');
    expect(limiter.trackedIps).toBe(1);
  });
});

describe('chatbot B1 — RequestLimiter: suất đồng thời', () => {
  it('GHT-05: 4 lời gọi đồng thời, lời thứ 4 bị từ chối; suất được trả khi một lời xong', async () => {
    const limiter = new RequestLimiter();
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
    const running = gates.map((gate) => limiter.withSlot(() => gate.promise));
    // Suất được giữ NGAY khi gọi (đồng bộ), trước mọi `await`
    expect(limiter.activeSlots).toBe(3);

    expect(await limiter.withSlot(() => Promise.resolve('thứ 4'))).toEqual({
      acquired: false,
    });
    expect(limiter.activeSlots).toBe(3);

    gates[0]?.resolve('xong 1');
    expect(await running[0]).toEqual({ acquired: true, value: 'xong 1' });
    expect(limiter.activeSlots).toBe(2);
    expect(await limiter.withSlot(() => Promise.resolve('lại'))).toEqual({
      acquired: true,
      value: 'lại',
    });

    gates[1]?.resolve('xong 2');
    gates[2]?.resolve('xong 3');
    await Promise.all(running);
    expect(limiter.activeSlots).toBe(0);
  });

  it('GHT-05: một lời gọi ném lỗi (bất đồng bộ) thì lỗi vẫn ra ngoài và suất được trả', async () => {
    const limiter = new RequestLimiter({ maxConcurrent: 1 });
    await expect(
      limiter.withSlot(() => Promise.reject(new Error('lớp AI hỏng'))),
    ).rejects.toThrow('lớp AI hỏng');
    expect(limiter.activeSlots).toBe(0);
    expect(await limiter.withSlot(() => Promise.resolve(1))).toEqual({
      acquired: true,
      value: 1,
    });
  });

  it('GHT-05: một lời gọi ném lỗi đồng bộ (trước khi trả Promise) cũng trả suất', async () => {
    const limiter = new RequestLimiter({ maxConcurrent: 1 });
    await expect(
      limiter.withSlot(() => {
        throw new Error('ném ngay');
      }),
    ).rejects.toThrow('ném ngay');
    expect(limiter.activeSlots).toBe(0);
  });

  it('GHT-05: ba lời gọi cùng lỗi liên tiếp không làm rò suất (bộ đếm không âm, không kẹt)', async () => {
    const limiter = new RequestLimiter({ maxConcurrent: 3 });
    await Promise.all(
      [1, 2, 3].map((n) =>
        limiter
          .withSlot(() => Promise.reject(new Error(`lỗi ${n}`)))
          .catch(() => undefined),
      ),
    );
    expect(limiter.activeSlots).toBe(0);
    const again = await Promise.all(
      [1, 2, 3].map((n) => limiter.withSlot(() => Promise.resolve(n))),
    );
    expect(again.every((result) => result.acquired)).toBe(true);
  });

  it('B1-GHT: tham số tuỳ chỉnh đi qua hàm dựng (không đọc biến môi trường)', () => {
    const limiter = new RequestLimiter({
      ipPerMinute: 2,
      ipPerDay: 3,
      maxConcurrent: 1,
      now: () => 0,
    });
    expect(limiter.checkIp('a').allowed).toBe(true);
    expect(limiter.checkIp('a').allowed).toBe(true);
    expect(limiter.checkIp('a')).toMatchObject({
      allowed: false,
      reason: 'PER_MINUTE',
    });
  });

  it('B1-GHT: tham số sai bị từ chối khi dựng', () => {
    expect(() => new RequestLimiter({ maxConcurrent: 0 })).toThrow(RangeError);
    expect(() => new RequestLimiter({ ipPerMinute: 0 })).toThrow(RangeError);
    expect(() => new RequestLimiter({ maxTrackedIps: 0 })).toThrow(RangeError);
  });
});

describe('chatbot B1 — RequestLimiter: đồng hồ mặc định', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('B1-GHT: không tiêm đồng hồ thì dùng đồng hồ hệ thống (đồng hồ giả của vitest điều khiển được)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T01:00:00Z'));
    const limiter = new RequestLimiter();
    for (let index = 0; index < 5; index += 1) limiter.checkIp('203.0.113.7');
    expect(limiter.checkIp('203.0.113.7')).toMatchObject({
      allowed: false,
      retryAfterSeconds: 60,
    });
    vi.advanceTimersByTime(MINUTE);
    expect(limiter.checkIp('203.0.113.7')).toEqual({ allowed: true });
  });
});
