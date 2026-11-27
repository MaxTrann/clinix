import { SlidingWindowLimiter } from './sliding-window-limiter.js';

// chatbot B1 — GHT-01 đến GHT-04, GHT-07 ở mức cửa sổ trượt tổng quát (PLAN chatbot 5.10, 7.5). Đồng hồ tiêm vào, không dùng đồng hồ thật.
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function makeClock(start = 0) {
  let now = start;
  return {
    now: () => now,
    set: (value: number) => {
      now = value;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('chatbot B1 — SlidingWindowLimiter (cửa sổ trượt theo khoá)', () => {
  it('GHT-01: đủ hạn mức thì lời gọi kế bị chặn kèm số giây phải chờ (làm tròn lên)', () => {
    const clock = makeClock();
    const limiter = new SlidingWindowLimiter({
      rules: [{ windowMs: MINUTE, limit: 5, reason: 'PER_MINUTE' }],
      maxKeys: 100,
      now: clock.now,
    });
    for (let second = 0; second < 5; second += 1) {
      clock.set(second * SECOND);
      expect(limiter.tryConsume('ip-a')).toEqual({ allowed: true });
    }
    // Lời gọi thứ 6 ở giây thứ 5: mốc cũ nhất (giây 0) hết hạn ở giây 60, còn 55 giây
    clock.set(5 * SECOND);
    expect(limiter.tryConsume('ip-a')).toEqual({
      allowed: false,
      reason: 'PER_MINUTE',
      retryAfterSeconds: 55,
    });
    // 54,5 giây còn lại thì làm tròn LÊN thành 55
    clock.set(5500);
    expect(limiter.tryConsume('ip-a')).toMatchObject({
      allowed: false,
      retryAfterSeconds: 55,
    });
  });

  it('GHT-02: cửa sổ nửa mở (now - W, now]: mốc đúng W trước đã rời cửa sổ; lời bị từ chối không được ghi nên không kéo dài thời gian chờ', () => {
    const clock = makeClock();
    const limiter = new SlidingWindowLimiter({
      rules: [{ windowMs: MINUTE, limit: 5, reason: 'PER_MINUTE' }],
      maxKeys: 100,
      now: clock.now,
    });
    for (let second = 0; second < 5; second += 1) {
      clock.set(second * SECOND);
      limiter.tryConsume('ip-a');
    }
    // Dồn nhiều lời gọi bị từ chối: nếu chúng bị ghi thì mốc 60 giây phía dưới sẽ không được mở
    for (let second = 5; second < 30; second += 1) {
      clock.set(second * SECOND);
      expect(limiter.tryConsume('ip-a').allowed).toBe(false);
    }
    clock.set(MINUTE - 1);
    expect(limiter.tryConsume('ip-a')).toMatchObject({
      allowed: false,
      retryAfterSeconds: 1,
    });
    clock.set(MINUTE);
    expect(limiter.tryConsume('ip-a')).toEqual({ allowed: true });
    // Vừa nhận một lời (mốc 60 giây) nên cửa sổ lại đầy ở 61 giây cho tới khi mốc giây 1 rời đi
    clock.set(MINUTE + 1);
    expect(limiter.tryConsume('ip-a')).toMatchObject({
      allowed: false,
      retryAfterSeconds: 1,
    });
    clock.set(MINUTE + SECOND);
    expect(limiter.tryConsume('ip-a')).toEqual({ allowed: true });
  });

  it('GHT-03: nhiều luật cùng lúc; luật theo ngày chặn dù luật theo phút còn chỗ, chờ đúng tới khi mốc cũ nhất qua 24 giờ', () => {
    const clock = makeClock();
    const limiter = new SlidingWindowLimiter({
      rules: [
        { windowMs: MINUTE, limit: 5, reason: 'PER_MINUTE' },
        { windowMs: DAY, limit: 50, reason: 'PER_DAY' },
      ],
      maxKeys: 100,
      now: clock.now,
    });
    // 13 giây một lời: không bao giờ quá 5 lời trong 60 giây, nên chỉ luật ngày làm việc
    for (let index = 0; index < 50; index += 1) {
      clock.set(index * 13 * SECOND);
      expect(limiter.tryConsume('ip-a')).toEqual({ allowed: true });
    }
    clock.set(50 * 13 * SECOND);
    expect(limiter.tryConsume('ip-a')).toEqual({
      allowed: false,
      reason: 'PER_DAY',
      retryAfterSeconds: DAY / SECOND - 50 * 13,
    });
    clock.set(DAY - 1);
    expect(limiter.tryConsume('ip-a')).toMatchObject({
      allowed: false,
      reason: 'PER_DAY',
      retryAfterSeconds: 1,
    });
    clock.set(DAY);
    expect(limiter.tryConsume('ip-a')).toEqual({ allowed: true });
  });

  it('GHT-03: cả hai luật cùng vượt thì trả luật phải chờ LÂU hơn', () => {
    const clock = makeClock();
    const limiter = new SlidingWindowLimiter({
      rules: [
        { windowMs: MINUTE, limit: 2, reason: 'PER_MINUTE' },
        { windowMs: HOUR, limit: 2, reason: 'PER_HOUR' },
      ],
      maxKeys: 100,
      now: clock.now,
    });
    limiter.tryConsume('ip-a');
    clock.set(SECOND);
    limiter.tryConsume('ip-a');
    clock.set(2 * SECOND);
    expect(limiter.tryConsume('ip-a')).toEqual({
      allowed: false,
      reason: 'PER_HOUR',
      retryAfterSeconds: HOUR / SECOND - 2,
    });
  });

  it('GHT-04: mỗi khoá đếm riêng', () => {
    const clock = makeClock();
    const limiter = new SlidingWindowLimiter({
      rules: [{ windowMs: MINUTE, limit: 1, reason: 'PER_MINUTE' }],
      maxKeys: 100,
      now: clock.now,
    });
    expect(limiter.tryConsume('ip-a').allowed).toBe(true);
    expect(limiter.tryConsume('ip-a').allowed).toBe(false);
    expect(limiter.tryConsume('ip-b').allowed).toBe(true);
    expect(limiter.tryConsume('ip-b').allowed).toBe(false);
  });

  it('B1-GHT: kiểm và ghi là MỘT bước đồng bộ: kết quả không phải Promise', () => {
    const limiter = new SlidingWindowLimiter({
      rules: [{ windowMs: MINUTE, limit: 1, reason: 'PER_MINUTE' }],
      maxKeys: 10,
      now: () => 0,
    });
    expect(limiter.tryConsume('ip-a')).not.toBeInstanceOf(Promise);
  });

  it('GHT-07: nhiều khoá khác nhau thì bản đồ không vượt trần; bỏ mục CŨ NHẤT (lần ghi gần nhất xa nhất), mục cũ bị bỏ thì đếm lại từ đầu', () => {
    const clock = makeClock();
    const limiter = new SlidingWindowLimiter({
      rules: [{ windowMs: DAY, limit: 1, reason: 'PER_DAY' }],
      maxKeys: 100,
      now: clock.now,
    });
    for (let index = 0; index < 150; index += 1) {
      clock.set(index);
      limiter.tryConsume(`ip-${index}`);
      expect(limiter.size).toBeLessThanOrEqual(100);
    }
    expect(limiter.size).toBe(100);
    // ip-0 đã bị bỏ: lời gọi mới của nó được nhận (nếu còn thì đã chạm hạn mức 1)
    expect(limiter.tryConsume('ip-0').allowed).toBe(true);
    // ip-149 vừa được ghi nên còn nguyên và đang chạm hạn mức
    expect(limiter.tryConsume('ip-149').allowed).toBe(false);
  });

  it('GHT-07: khoá được ghi lại gần đây thì được giữ (thứ tự theo lần ghi, không theo lần tạo)', () => {
    const clock = makeClock();
    const limiter = new SlidingWindowLimiter({
      rules: [{ windowMs: DAY, limit: 2, reason: 'PER_DAY' }],
      maxKeys: 3,
      now: clock.now,
    });
    limiter.tryConsume('a'); // a1
    limiter.tryConsume('b');
    limiter.tryConsume('c');
    limiter.tryConsume('a'); // a2: a thành mới nhất, thứ tự cũ → mới: b, c, a
    limiter.tryConsume('d'); // thêm khoá thứ 4: bỏ b
    expect(limiter.size).toBe(3);
    expect(limiter.tryConsume('b').allowed).toBe(true); // b bắt đầu lại, và bỏ c
    expect(limiter.tryConsume('a').allowed).toBe(false); // a còn nguyên và đã dùng đủ 2
    expect(limiter.tryConsume('d').allowed).toBe(true); // d còn nguyên, mới dùng 1
  });

  it('GHT-07: mục quá hạn (cửa sổ dài nhất) bị dọn ở lần gọi kế tiếp, không cần chờ đầy trần', () => {
    const clock = makeClock();
    const limiter = new SlidingWindowLimiter({
      rules: [
        { windowMs: MINUTE, limit: 5, reason: 'PER_MINUTE' },
        { windowMs: DAY, limit: 50, reason: 'PER_DAY' },
      ],
      maxKeys: 1000,
      now: clock.now,
    });
    for (let index = 0; index < 500; index += 1) {
      limiter.tryConsume(`ip-${index}`);
    }
    expect(limiter.size).toBe(500);
    // Còn 1 mili giây nữa mới quá hạn: chưa dọn
    clock.set(DAY - 1);
    limiter.tryConsume('ip-moi');
    expect(limiter.size).toBe(501);
    // Quá 24 giờ: một lần gọi dọn hết 500 mục cũ (chỉ còn ip-moi và mục mới này)
    clock.set(DAY + 1);
    limiter.tryConsume('ip-khac');
    expect(limiter.size).toBe(2);
  });

  it('B1-GHT: tham số sai bị từ chối ngay khi dựng (không chạy với trần vô nghĩa)', () => {
    const base = { windowMs: MINUTE, limit: 5, reason: 'X' };
    expect(() => new SlidingWindowLimiter({ rules: [], maxKeys: 10 })).toThrow(
      RangeError,
    );
    expect(
      () =>
        new SlidingWindowLimiter({
          rules: [{ ...base, limit: 0 }],
          maxKeys: 10,
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new SlidingWindowLimiter({
          rules: [{ ...base, windowMs: 0 }],
          maxKeys: 10,
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new SlidingWindowLimiter({
          rules: [{ ...base, limit: 1.5 }],
          maxKeys: 10,
        }),
    ).toThrow(RangeError);
    expect(
      () => new SlidingWindowLimiter({ rules: [base], maxKeys: 0 }),
    ).toThrow(RangeError);
  });
});
