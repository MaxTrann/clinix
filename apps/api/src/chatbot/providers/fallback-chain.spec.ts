import { fakeSecretValue } from '../../common/testing/sample-secrets.js';
import { setup } from '../testing/chain-test-kit.js';
import { drive } from '../testing/fake-clock.js';
import { FakeHttpTransport, reply } from '../testing/fake-http-transport.js';
import {
  FakeProvider,
  fail,
  hang,
  ok,
  throws,
  type FakeStep,
} from '../testing/fake-provider.js';
import { ERROR_BODY_MARKER, readFixture } from '../testing/fixture-reader.js';
import {
  WRONG_ENUM_JSON,
  buildSampleRequest,
  sampleAnswerJson,
} from '../testing/sample-request.js';
import type { AiProvider } from './ai-provider.js';
import { GeminiProvider } from './gemini.provider.js';
import { GroqProvider } from './groq.provider.js';

// chatbot P1 — HDA-01…HDA-07, HDA-10, HDA-11, HDA-15 (phần chuỗi) của PLAN chatbot 7.1. HDA-08, HDA-09 ở fallback-chain.deadline.spec.ts.
// Mọi lớp là FakeProvider hay adapter với FakeHttpTransport; đồng hồ ảo, không chờ thật, không chạm mạng.
const request = buildSampleRequest();
const GROQ_TEXT = sampleAnswerJson('từ Groq');
const GEMINI_TEXT = sampleAnswerJson('từ Gemini');
const groqAnswer = {
  kind: 'answer',
  provider: 'groq',
  value: { loai: 'hoiDap', noiDung: 'từ Groq' },
};
const geminiAnswer = {
  kind: 'answer',
  provider: 'gemini',
  value: { loai: 'hoiDap', noiDung: 'từ Gemini' },
};
const groqWith = (...steps: FakeStep[]) => new FakeProvider('groq', steps);
const geminiWith = (...steps: FakeStep[]) => new FakeProvider('gemini', steps);

describe('FallbackChain (chatbot P1)', () => {
  it('HDA-01: Groq trả đúng ⇒ dùng câu của Groq; Gemini không bị gọi', async () => {
    const groq = groqWith(ok(GROQ_TEXT));
    const gemini = geminiWith(ok(GEMINI_TEXT));
    const { chain, clock } = setup([groq, gemini]);

    expect(await chain.run(request)).toEqual(groqAnswer);
    expect(groq.calls).toBe(1);
    expect(gemini.calls).toBe(0);
    expect(clock.pendingCount).toBe(0); // thành công cũng huỷ hẹn giờ, không để lại handle mở
    expect(groq.signals[0]?.aborted).toBe(false);
  });

  it('HDA-02: Groq hết giờ hai lần ⇒ Gemini được gọi đúng một lần; kết quả của Gemini', async () => {
    const groq = groqWith(hang(), hang());
    const gemini = geminiWith(ok(GEMINI_TEXT));
    const { chain, clock } = setup([groq, gemini]);

    expect(await drive(clock, chain.run(request))).toEqual(geminiAnswer);
    expect(groq.calls).toBe(2);
    expect(gemini.calls).toBe(1);
    expect(clock.startedDelays).toEqual([6000, 6000, 8000]);
    // Hết hạn thì chuỗi huỷ AbortController của lần gọi (để fetch thật dừng): cả hai lần của Groq
    expect(groq.signals.map((signal) => signal.aborted)).toEqual([true, true]);
    expect(clock.pendingCount).toBe(0);
  });

  it('HDA-03: Groq 5xx rồi đúng ở lần thử lại ⇒ đúng hai lời gọi Groq; không cooldown', async () => {
    const groq = groqWith(fail('server', 500), ok(GROQ_TEXT), ok(GROQ_TEXT));
    const gemini = geminiWith(ok(GEMINI_TEXT));
    const { chain } = setup([groq, gemini]);

    expect(await chain.run(request)).toEqual(groqAnswer);
    expect(groq.calls).toBe(2);
    expect(gemini.calls).toBe(0);
    // Lần hỏi kế tiếp, ngay lập tức: Groq vẫn được gọi (không bị cooldown)
    expect(await chain.run(request)).toEqual(groqAnswer);
    expect(groq.calls).toBe(3);
  });

  it('HDA-04: Groq trả chữ không phải JSON, rồi JSON sai enum ⇒ thử lại đúng một lần rồi chuyển Gemini', async () => {
    const groq = groqWith(ok('đây không phải JSON'), ok(WRONG_ENUM_JSON));
    const gemini = geminiWith(ok(GEMINI_TEXT));
    const { chain, logger } = setup([groq, gemini]);

    expect(await chain.run(request)).toEqual(geminiAnswer);
    expect(groq.calls).toBe(2);
    expect(gemini.calls).toBe(1);
    expect(logger.messages).toHaveLength(2);
    expect(logger.messages.every((m) => m.includes('badOutput'))).toBe(true);
  });

  it('HDA-04: JSON hợp lệ nhưng thiếu trường bắt buộc, hay không phải đối tượng, cũng là sai lược đồ', async () => {
    const groq = groqWith(ok('[1,2,3]'), ok('{"loai":"hoiDap"}'));
    const gemini = geminiWith(ok(GEMINI_TEXT));
    const { chain } = setup([groq, gemini]);

    expect(await chain.run(request)).toEqual(geminiAnswer);
    expect(groq.calls).toBe(2);
  });

  it('HDA-05: Groq 429 ⇒ KHÔNG thử lại; sang Gemini; Groq vào cooldown đúng 60 giây', async () => {
    const groq = groqWith(fail('rateLimited', 429), ok(GROQ_TEXT));
    const gemini = geminiWith(
      ok(GEMINI_TEXT),
      ok(GEMINI_TEXT),
      ok(GEMINI_TEXT),
    );
    const { chain, clock, logger } = setup([groq, gemini]);

    expect(await chain.run(request)).toEqual(geminiAnswer);
    expect(groq.calls).toBe(1);
    expect(logger.messages).toEqual([
      'Lớp AI groq lỗi: rateLimited (HTTP 429).',
    ]);

    clock.advance(59_999);
    expect(await chain.run(request)).toEqual(geminiAnswer);
    expect(groq.calls).toBe(1); // còn trong cooldown

    clock.advance(1);
    expect(await chain.run(request)).toEqual(groqAnswer);
    expect(groq.calls).toBe(2); // đủ 60 giây: được gọi lại
  });

  it.each([401, 404, 400, 413])(
    'HDA-06: Groq %i (4xx cấu hình sai) ⇒ không thử lại; cảnh báo có tên lớp và mã HTTP, không có khoá; sang Gemini',
    async (status) => {
      const groq = groqWith(fail('rejected', status));
      const gemini = geminiWith(ok(GEMINI_TEXT));
      const { chain, logger } = setup([groq, gemini]);

      expect(await chain.run(request)).toEqual(geminiAnswer);
      expect(groq.calls).toBe(1);
      expect(logger.messages).toEqual([
        `Lớp AI groq lỗi: rejected (HTTP ${status}). Kiểm tra khoá, địa chỉ hoặc model có thể đã ngừng.`,
      ]);
    },
  );

  it('HDA-07: cả hai lớp hỏng ⇒ kết quả "dự phòng", không ném lỗi', async () => {
    const groq = groqWith(fail('server', 500), fail('server', 503));
    const gemini = geminiWith(fail('rateLimited', 429));
    const { chain } = setup([groq, gemini]);

    await expect(chain.run(request)).resolves.toEqual({ kind: 'fallback' });
    expect(groq.calls).toBe(2);
    expect(gemini.calls).toBe(1);
  });

  it('HDA-07: lỗi lạ (không phải ProviderError) hay lỗi ném đồng bộ cũng không làm chuỗi ném; log chỉ có tên lớp lỗi, không có thông điệp', async () => {
    const secret = fakeSecretValue('thong-diep-bi-mat');
    const groq = groqWith(
      throws(new TypeError(secret)),
      throws(new TypeError(secret)),
    );
    const syncThrower: AiProvider = {
      name: 'gemini',
      configured: true,
      generate: () => {
        throw new RangeError(secret);
      },
    };
    const { chain, logger } = setup([groq, syncThrower]);

    await expect(chain.run(request)).resolves.toEqual({ kind: 'fallback' });
    const logged = logger.messages.join('\n');
    expect(logged).toContain('TypeError');
    expect(logged).toContain('RangeError');
    expect(logged).not.toContain(secret);
  });

  it('HDA-10: lớp chưa cấu hình bị bỏ qua, lớp kia vẫn chạy', async () => {
    const groq = new FakeProvider('groq', [ok(GROQ_TEXT)], false);
    const gemini = geminiWith(ok(GEMINI_TEXT));
    const { chain, clock } = setup([groq, gemini]);

    expect(await chain.run(request)).toEqual(geminiAnswer);
    expect(groq.calls).toBe(0);
    expect(clock.pendingCount).toBe(0);
  });

  it('HDA-10: cả hai lớp chưa cấu hình ⇒ dự phòng ngay, không lời gọi nào, không hẹn giờ nào', async () => {
    const groq = new FakeProvider('groq', [ok(GROQ_TEXT)], false);
    const gemini = new FakeProvider('gemini', [ok(GEMINI_TEXT)], false);
    const { chain, clock } = setup([groq, gemini]);

    await expect(chain.run(request)).resolves.toEqual({ kind: 'fallback' });
    expect(groq.calls + gemini.calls).toBe(0);
    expect(clock.startedDelays).toEqual([]);
  });

  it('HDA-10: không có provider nào (NODE_ENV=test) ⇒ dự phòng ngay', async () => {
    const { chain } = setup([]);
    await expect(chain.run(request)).resolves.toEqual({ kind: 'fallback' });
  });

  it('HDA-10: AI_ENABLED=false dù có khoá ⇒ adapter thật không chạm transport (0 lời gọi) và chuỗi trả dự phòng', async () => {
    const transport = new FakeHttpTransport([]);
    const providers = [
      new GroqProvider(
        {
          enabled: false,
          apiKey: fakeSecretValue('groq'),
          model: 'm',
          baseUrl: 'https://groq.example.test/v1',
        },
        transport,
      ),
      new GeminiProvider(
        {
          enabled: false,
          apiKey: fakeSecretValue('gemini'),
          model: 'm',
          baseUrl: 'https://gemini.example.test/v1',
        },
        transport,
      ),
    ];
    expect(providers.map((p) => p.configured)).toEqual([false, false]);
    const { chain } = setup(providers);

    await expect(chain.run(request)).resolves.toEqual({ kind: 'fallback' });
    expect(transport.requests).toHaveLength(0);
  });

  it('HDA-11: Groq chạm trần mỗi phút ⇒ bỏ qua Groq, KHÔNG cooldown; sang Gemini', async () => {
    const groq = groqWith(ok(GROQ_TEXT), ok(GROQ_TEXT), ok(GROQ_TEXT));
    const gemini = geminiWith(ok(GEMINI_TEXT));
    const { chain, clock } = setup([groq, gemini], {
      perMinute: { groq: 2, gemini: 10 },
    });

    expect(await chain.run(request)).toEqual(groqAnswer); // t = 0
    clock.advance(30_000);
    expect(await chain.run(request)).toEqual(groqAnswer); // t = 30 giây: suất thứ hai
    expect(await chain.run(request)).toEqual(geminiAnswer); // vẫn t = 30 giây: hết suất
    expect(groq.calls).toBe(2);

    // Lời gọi lúc t = 0 hết hạn ở t = 60 giây, tức 30 giây sau lần bị chặn: nếu có cooldown 60 giây thì Groq còn bị bỏ qua tới t = 90 giây
    clock.advance(30_000);
    expect(await chain.run(request)).toEqual(groqAnswer);
    expect(groq.calls).toBe(3);
  });

  it('HDA-11: trần mỗi phút tính theo từng nhà cung cấp (Groq hết suất không làm Gemini hết suất)', async () => {
    const groq = groqWith(ok(GROQ_TEXT));
    const gemini = geminiWith(ok(GEMINI_TEXT), ok(GEMINI_TEXT));
    const { chain } = setup([groq, gemini], {
      perMinute: { groq: 1, gemini: 1 },
    });

    expect(await chain.run(request)).toEqual(groqAnswer);
    expect(await chain.run(request)).toEqual(geminiAnswer); // Groq hết suất, Gemini còn
    await expect(chain.run(request)).resolves.toEqual({ kind: 'fallback' }); // cả hai hết suất
    expect(gemini.calls).toBe(1);
  });

  it('HDA-11: lần thử lại cũng tiêu một suất; hết suất giữa chừng thì lớp (đã hỏng một lần) vào cooldown', async () => {
    const groq = groqWith(fail('server', 500), ok(GROQ_TEXT));
    const gemini = geminiWith(ok(GEMINI_TEXT), ok(GEMINI_TEXT));
    const { chain, clock } = setup([groq, gemini], {
      perMinute: { groq: 1, gemini: 10 },
      cooldownMs: 120_000,
    });

    expect(await chain.run(request)).toEqual(geminiAnswer);
    expect(groq.calls).toBe(1); // lần thử lại bị chặn vì hết suất

    // Ở t = 61 giây suất đã trượt khỏi cửa sổ, nên chỉ cooldown (120 giây) giữ Groq lại
    clock.advance(61_000);
    expect(await chain.run(request)).toEqual(geminiAnswer);
    expect(groq.calls).toBe(1);
  });

  it('HDA-15 (chuỗi): thân lỗi của nhà cung cấp không vào log; kết quả vẫn là câu trả lời của lớp sau', async () => {
    const transport = new FakeHttpTransport([
      reply(429, readFixture('groq/error-429.json')),
      reply(200, readFixture('gemini/response-ok.json')),
    ]);
    const providers = [
      new GroqProvider(
        {
          enabled: true,
          apiKey: fakeSecretValue('groq'),
          model: 'm',
          baseUrl: 'https://groq.example.test/v1',
        },
        transport,
      ),
      new GeminiProvider(
        {
          enabled: true,
          apiKey: fakeSecretValue('gemini'),
          model: 'm',
          baseUrl: 'https://gemini.example.test/v1',
        },
        transport,
      ),
    ];
    const { chain, logger } = setup(providers);

    const result = await chain.run(request);
    expect(result).toEqual({
      kind: 'answer',
      provider: 'gemini',
      value: { loai: 'hoiDap', noiDung: 'Phòng khám mở cửa lúc 8 giờ.' },
    });
    expect(readFixture('groq/error-429.json')).toContain(ERROR_BODY_MARKER);
    expect(logger.messages).toEqual([
      'Lớp AI groq lỗi: rateLimited (HTTP 429).',
    ]);
    expect(logger.messages.join('\n')).not.toContain(ERROR_BODY_MARKER);
    const keys = [fakeSecretValue('groq'), fakeSecretValue('gemini')];
    for (const key of keys) {
      expect(logger.messages.join('\n')).not.toContain(key);
    }
  });
});
