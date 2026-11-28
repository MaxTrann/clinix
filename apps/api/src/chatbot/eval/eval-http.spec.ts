import { describe, expect, it } from 'vitest';
import {
  CallRecorder,
  Pacer,
  PACING_DEFAULTS,
  RateLimitGuard,
  createVirtualPaceClock,
  layerOfUrl,
  parseDurationMs,
  parseRetryAfterMs,
  parseUsage,
  type PacerConfig,
  type RecordedCall,
} from './eval-http.js';

// Test của lớp ghi lời gọi, bộ giãn lời gọi và bộ đếm 429 (chatbot X2). Đồng hồ ảo, không mạng, không khoá.

const call = (extra: Partial<RecordedCall> = {}): RecordedCall => ({
  layer: 'groq',
  status: 200,
  ms: 100,
  tokensIn: 1800,
  tokensOut: 100,
  tokensTotal: 1900,
  retryAfterMs: null,
  remainingTokens: null,
  resetMs: null,
  error: null,
  ...extra,
});

const pacerConfig = (extra: Partial<PacerConfig> = {}): PacerConfig => ({
  gapMs: 4000,
  groqTpm: 8000,
  groqTpd: 200_000,
  groqUsedToday: 0,
  groqActive: true,
  ...extra,
});

describe('X2-04: đọc thời gian, retry-after, usage', () => {
  it('X2-04: parseDurationMs đọc "7.66s", "2m59.56s", "250ms", "1h2m3s", "12" và từ chối chuỗi lạ', () => {
    expect(parseDurationMs('7.66s')).toBe(7660);
    expect(parseDurationMs('2m59.56s')).toBe(179_560);
    expect(parseDurationMs('250ms')).toBe(250);
    expect(parseDurationMs('1h2m3s')).toBe(3_723_000);
    expect(parseDurationMs('12')).toBe(12_000);
    expect(parseDurationMs('abc')).toBeNull();
    expect(parseDurationMs('')).toBeNull();
    expect(parseDurationMs(null)).toBeNull();
    expect(parseDurationMs('5s dư')).toBeNull();
  });

  it('X2-04: retry-after dạng số giây; dạng ngày HTTP hay âm thì null', () => {
    expect(parseRetryAfterMs('30')).toBe(30_000);
    expect(parseRetryAfterMs('0')).toBe(0);
    expect(parseRetryAfterMs('Wed, 21 Oct 2026 07:28:00 GMT')).toBeNull();
    expect(parseRetryAfterMs('-3')).toBeNull();
    expect(parseRetryAfterMs(null)).toBeNull();
  });

  it('X2-04: usage của Groq và Gemini; thân lạ thì null; lớp lạ không có usage', () => {
    const groq = JSON.stringify({
      usage: {
        prompt_tokens: 1700,
        completion_tokens: 120,
        total_tokens: 1820,
      },
    });
    const gemini = JSON.stringify({
      usage: {
        total_input_tokens: 1500,
        total_output_tokens: 80,
        total_tokens: 1580,
      },
    });
    expect(parseUsage('groq', groq)).toEqual({
      tokensIn: 1700,
      tokensOut: 120,
      tokensTotal: 1820,
    });
    expect(parseUsage('gemini', gemini)).toEqual({
      tokensIn: 1500,
      tokensOut: 80,
      tokensTotal: 1580,
    });
    // Hai nhà cung cấp cùng gọi tổng là `total_tokens`; tên vào và ra khác nhau nên đọc nhầm lớp thì mất hai trường đó
    expect(parseUsage('groq', gemini)).toEqual({
      tokensIn: null,
      tokensOut: null,
      tokensTotal: 1580,
    });
    expect(parseUsage('groq', 'không phải JSON')).toEqual({
      tokensIn: null,
      tokensOut: null,
      tokensTotal: null,
    });
    expect(parseUsage('groq', '[]')).toEqual({
      tokensIn: null,
      tokensOut: null,
      tokensTotal: null,
    });
    expect(parseUsage('khac', groq).tokensTotal).toBeNull();
  });

  it('X2-04: lớp theo địa chỉ', () => {
    expect(layerOfUrl('https://api.groq.com/openai/v1/chat/completions')).toBe(
      'groq',
    );
    expect(
      layerOfUrl(
        'https://generativelanguage.googleapis.com/v1beta/interactions',
      ),
    ).toBe('gemini');
    expect(layerOfUrl('https://example.invalid/x')).toBe('khac');
  });
});

describe('X2-13: bọc fetch để ghi lời gọi', () => {
  it('X2-13: ghi mã, thời gian, usage, retry-after, header hạn mức; trả phản hồi nguyên vẹn; KHÔNG ghi thân hay header yêu cầu', async () => {
    const clock = createVirtualPaceClock(1000);
    const real: typeof fetch = (_input, init) => {
      clock.advance(250);
      // Header yêu cầu (có khoá) không bao giờ vào bản ghi
      expect(new Headers(init?.headers).get('authorization')).toBe(
        'Bearer gsk_GIA',
      );
      return Promise.resolve(
        new Response(
          JSON.stringify({
            usage: {
              prompt_tokens: 1700,
              completion_tokens: 120,
              total_tokens: 1820,
            },
          }),
          {
            status: 200,
            headers: {
              'x-ratelimit-remaining-tokens': '6180',
              'x-ratelimit-reset-tokens': '7.66s',
            },
          },
        ),
      );
    };
    const recorder = new CallRecorder(real, () => clock.now());
    const response = await recorder.fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer gsk_GIA' },
        body: '{"cauHoi":"CAU-HOI-KHONG-DUOC-GHI"}',
      },
    );
    // Người gọi vẫn đọc được thân (bộ ghi chỉ đọc bản sao)
    expect(await response.json()).toMatchObject({
      usage: { total_tokens: 1820 },
    });
    const [recorded, ...rest] = recorder.drain();
    expect(rest).toEqual([]);
    expect(recorded).toEqual({
      layer: 'groq',
      status: 200,
      ms: 250,
      tokensIn: 1700,
      tokensOut: 120,
      tokensTotal: 1820,
      retryAfterMs: null,
      remainingTokens: 6180,
      resetMs: 7660,
      error: null,
    });
    expect(JSON.stringify(recorded)).not.toContain('gsk_GIA');
    expect(JSON.stringify(recorded)).not.toContain('CAU-HOI-KHONG-DUOC-GHI');
    expect(recorder.drain()).toEqual([]);
  });

  it('X2-13: 429 có retry-after; lỗi mạng và hết giờ được ghi rồi ném lại nguyên lỗi', async () => {
    const responses = [
      () =>
        Promise.resolve(
          new Response('', { status: 429, headers: { 'retry-after': '7' } }),
        ),
      () =>
        Promise.reject(
          Object.assign(new Error('đã huỷ'), { name: 'AbortError' }),
        ),
      () => Promise.reject(new TypeError('fetch failed')),
    ];
    const recorder = new CallRecorder(
      () =>
        (
          responses.shift() ?? (() => Promise.reject(new Error('hết kịch bản')))
        )(),
      () => 0,
    );
    const url = 'https://generativelanguage.googleapis.com/v1beta/interactions';
    expect((await recorder.fetch(url)).status).toBe(429);
    await expect(recorder.fetch(url)).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(recorder.fetch(url)).rejects.toThrow('fetch failed');
    const calls = recorder.drain();
    expect(
      calls.map((c) => [c.layer, c.status, c.retryAfterMs, c.error]),
    ).toEqual([
      ['gemini', 429, 7000, null],
      ['gemini', null, null, 'timeout'],
      ['gemini', null, null, 'network'],
    ]);
  });
});

describe('X2-04: Pacer (giãn lời gọi theo hạn mức)', () => {
  it('X2-04: câu không cần AI không chờ; câu cần AI cách nhau tối thiểu gapMs', async () => {
    const clock = createVirtualPaceClock();
    const pacer = new Pacer(clock, pacerConfig({ groqActive: false }));
    expect(await pacer.before(false)).toBe(0);
    await pacer.before(true);
    clock.advance(1000);
    const waited = await pacer.before(true);
    expect(waited).toBe(3000);
    expect(clock.now()).toBe(4000);
  });

  it('X2-04: cửa sổ token mỗi phút tự đếm: ba lời gọi 2.400 token vừa 8.000, lời thứ tư phải chờ cửa sổ trượt', async () => {
    const clock = createVirtualPaceClock();
    const pacer = new Pacer(clock, pacerConfig({ gapMs: 0 }));
    for (let index = 0; index < 3; index += 1) {
      await pacer.before(true);
      pacer.after([call({ tokensTotal: 2400 })]);
    }
    expect(clock.now()).toBe(0);
    const waited = await pacer.before(true);
    // Lời gọi đầu ở t = 0 hết hạn sau 60 giây (cộng 100 ms đệm)
    expect(waited).toBe(60_100);
    expect(pacer.groqTokensThisRun).toBe(7200);
  });

  it('X2-04: header x-ratelimit-remaining-tokens và reset: còn ít hơn ước tính thì chờ tới lúc hồi', async () => {
    const clock = createVirtualPaceClock();
    const pacer = new Pacer(clock, pacerConfig({ gapMs: 0 }));
    await pacer.before(true);
    pacer.after([call({ remainingTokens: 500, resetMs: 12_000 })]);
    const waited = await pacer.before(true);
    expect(waited).toBe(12_500);
    // Đủ token còn lại thì không chờ
    const rich = new Pacer(createVirtualPaceClock(), pacerConfig({ gapMs: 0 }));
    await rich.before(true);
    rich.after([call({ remainingTokens: 7000, resetMs: 12_000 })]);
    expect(await rich.before(true)).toBe(0);
  });

  it('X2-04: sau 429 chờ retry-after nhưng không ít hơn 60 giây và không quá 300 giây', async () => {
    const short = createVirtualPaceClock();
    const pacerShort = new Pacer(short, pacerConfig({ gapMs: 0 }));
    pacerShort.after([
      call({ status: 429, retryAfterMs: 5000, tokensTotal: null }),
    ]);
    expect(await pacerShort.before(true)).toBe(PACING_DEFAULTS.blockMinMs);
    const long = createVirtualPaceClock();
    const pacerLong = new Pacer(long, pacerConfig({ gapMs: 0 }));
    pacerLong.after([
      call({ status: 429, retryAfterMs: 900_000, tokensTotal: null }),
    ]);
    expect(await pacerLong.before(true)).toBe(PACING_DEFAULTS.blockMaxMs);
    const middle = new Pacer(
      createVirtualPaceClock(),
      pacerConfig({ gapMs: 0 }),
    );
    middle.after([
      call({ status: 429, retryAfterMs: 90_000, tokensTotal: null }),
    ]);
    expect(await middle.before(true)).toBe(90_000);
  });

  it('X2-04: ngân sách ngày: đúng bằng thì còn chạy, quá một token thì dừng; câu do luật bắt luôn được; tính cả số đã dùng trong ngày', () => {
    const estimate = PACING_DEFAULTS.estimateGroqTokens;
    const exact = new Pacer(
      createVirtualPaceClock(),
      pacerConfig({ groqTpd: 10_000, groqUsedToday: 10_000 - estimate }),
    );
    expect(exact.affords(true)).toBe(true);
    const over = new Pacer(
      createVirtualPaceClock(),
      pacerConfig({ groqTpd: 10_000, groqUsedToday: 10_000 - estimate + 1 }),
    );
    expect(over.affords(true)).toBe(false);
    expect(over.affords(false)).toBe(true);
    const gemini = new Pacer(
      createVirtualPaceClock(),
      pacerConfig({ groqTpd: 1, groqActive: false }),
    );
    expect(gemini.affords(true)).toBe(true);
    const running = new Pacer(
      createVirtualPaceClock(),
      pacerConfig({ groqTpd: 2 * estimate }),
    );
    running.after([call({ tokensTotal: estimate })]);
    expect(running.affords(true)).toBe(true);
    running.after([call({ tokensTotal: 1 })]);
    expect(running.affords(true)).toBe(false);
    expect(running.groqTokensToday).toBe(estimate + 1);
  });
});

describe('X2-05: RateLimitGuard (429 liên tiếp)', () => {
  it('X2-05: hai 429 chưa dừng; ba 429 liên tiếp cùng một lớp thì ngắt', () => {
    const guard = new RateLimitGuard();
    guard.record([call({ status: 429 }), call({ status: 429 })]);
    expect(guard.tripped()).toBeNull();
    guard.record([call({ status: 429 })]);
    expect(guard.tripped()).toBe('groq');
  });

  it('X2-05: một mã 2xx của lớp đó đặt lại bộ đếm; mã 503 không đặt lại và cũng không tính', () => {
    const reset = new RateLimitGuard();
    reset.record([
      call({ status: 429 }),
      call({ status: 429 }),
      call({ status: 200 }),
      call({ status: 429 }),
      call({ status: 429 }),
    ]);
    expect(reset.tripped()).toBeNull();
    const sticky = new RateLimitGuard();
    sticky.record([
      call({ status: 429 }),
      call({ status: 503 }),
      call({ status: 429 }),
      call({ status: 429 }),
    ]);
    expect(sticky.tripped()).toBe('groq');
    const network = new RateLimitGuard();
    network.record([
      call({ status: 429 }),
      call({ status: null, error: 'network' }),
      call({ status: 429 }),
    ]);
    expect(network.tripped()).toBeNull();
  });

  it('X2-05: hai lớp khác nhau đếm riêng: hai 429 của mỗi lớp không ngắt', () => {
    const guard = new RateLimitGuard();
    guard.record([
      call({ layer: 'groq', status: 429 }),
      call({ layer: 'gemini', status: 429 }),
      call({ layer: 'groq', status: 429 }),
      call({ layer: 'gemini', status: 429 }),
    ]);
    expect(guard.tripped()).toBeNull();
    guard.record([call({ layer: 'gemini', status: 429 })]);
    expect(guard.tripped()).toBe('gemini');
  });

  it('X2-05: giới hạn tuỳ chỉnh được và lớp ngắt đầu tiên được giữ nguyên', () => {
    const guard = new RateLimitGuard(2);
    guard.record([
      call({ layer: 'gemini', status: 429 }),
      call({ layer: 'gemini', status: 429 }),
    ]);
    guard.record([
      call({ layer: 'groq', status: 429 }),
      call({ layer: 'groq', status: 429 }),
    ]);
    expect(guard.tripped()).toBe('gemini');
  });
});
