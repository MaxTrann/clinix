import { setup } from '../testing/chain-test-kit.js';
import { drive } from '../testing/fake-clock.js';
import { FakeProvider, fail, hang, ok } from '../testing/fake-provider.js';
import {
  buildSampleRequest,
  sampleAnswerJson,
} from '../testing/sample-request.js';

// chatbot P1 — HDA-08 (hạn chót tổng 20 giây lan truyền) và HDA-09 (cooldown) của PLAN chatbot 7.1, trên đồng hồ ảo.
const request = buildSampleRequest();
const GOOD = sampleAnswerJson('ổn');
const answerOf = (provider: 'groq' | 'gemini') => ({
  kind: 'answer',
  provider,
  value: { loai: 'hoiDap', noiDung: 'ổn' },
});
const hangs = () => [hang(), hang()];

describe('FallbackChain: hạn chót tổng (HDA-08)', () => {
  it('HDA-08: cả hai lớp treo ⇒ 6 + 6 + 8 = 20 giây, Gemini đúng một lần, rồi dự phòng', async () => {
    const groq = new FakeProvider('groq', hangs());
    const gemini = new FakeProvider('gemini', hangs());
    const { chain, clock } = setup([groq, gemini]);

    const result = await drive(clock, chain.run(request));

    expect(result).toEqual({ kind: 'fallback' });
    expect(clock.startedDelays).toEqual([6000, 6000, 8000]);
    expect(clock.now()).toBe(20_000);
    expect(groq.calls).toBe(2);
    expect(gemini.calls).toBe(1); // lần thử lại của Gemini không còn thời gian
    expect(clock.pendingCount).toBe(0);
  });

  it('HDA-08: lần thử cuối chỉ chờ phần thời gian CÒN LẠI (7 + 7 giây rồi Gemini chỉ còn 6 giây, không phải 9)', async () => {
    const groq = new FakeProvider('groq', hangs());
    const gemini = new FakeProvider('gemini', hangs());
    const { chain, clock } = setup([groq, gemini], {
      layerTimeoutMs: { groq: 7000, gemini: 9000 },
    });

    await drive(clock, chain.run(request));

    expect(clock.startedDelays).toEqual([7000, 7000, 6000]);
    expect(clock.now()).toBe(20_000);
  });

  it('HDA-08: còn đúng 2000 ms thì VẪN thử (biên), và chỉ chờ 2000 ms', async () => {
    const groq = new FakeProvider('groq', hangs());
    const gemini = new FakeProvider('gemini', hangs());
    const { chain, clock } = setup([groq, gemini], { totalTimeoutMs: 14_000 });

    await drive(clock, chain.run(request));

    expect(gemini.calls).toBe(1);
    expect(clock.startedDelays).toEqual([6000, 6000, 2000]);
    expect(clock.now()).toBe(14_000);
  });

  it('HDA-08: còn 1999 ms thì KHÔNG thử; dự phòng ngay (Gemini 0 lời gọi, thời gian dừng ở 12 giây)', async () => {
    const groq = new FakeProvider('groq', hangs());
    const gemini = new FakeProvider('gemini', [ok(GOOD)]);
    const { chain, clock } = setup([groq, gemini], {
      totalTimeoutMs: 13_999,
    });

    const result = await drive(clock, chain.run(request));

    expect(result).toEqual({ kind: 'fallback' });
    expect(gemini.calls).toBe(0);
    expect(clock.startedDelays).toEqual([6000, 6000]);
    expect(clock.now()).toBe(12_000);
  });

  it('HDA-08: hạn chót do CHUỖI giữ: một lớp không bao giờ trả lời và phớt lờ signal vẫn bị cắt đúng hạn', async () => {
    // FakeProvider.hang() không nghe signal (trường hợp xấu nhất): chỉ hẹn giờ của chuỗi mới cắt được
    const groq = new FakeProvider('groq', [hang()]);
    const { chain, clock } = setup([groq], { totalTimeoutMs: 6000 });

    await drive(clock, chain.run(request));

    expect(clock.now()).toBe(6000);
    expect(groq.signals[0]?.aborted).toBe(true);
  });

  it('HDA-08 (điều chỉnh phiên kiểm): lớp đã hỏng ở lần 1 rồi hết giờ vẫn vào cooldown, kẻo lần hỏi sau lại dồn thời gian vào lớp hỏng', async () => {
    const groq = new FakeProvider('groq', [hang(), ok(GOOD)]);
    const gemini = new FakeProvider('gemini', [ok(GOOD), ok(GOOD)]);
    const { chain, clock } = setup([groq, gemini], { totalTimeoutMs: 7500 });

    // Lần 1: Groq timeout ở 6 giây, còn 1,5 giây nên không thử lại ⇒ dự phòng
    const first = await drive(clock, chain.run(request));
    expect(first).toEqual({ kind: 'fallback' });
    expect(groq.calls).toBe(1);
    expect(gemini.calls).toBe(0);

    // Lần 2 (1 giây sau): Groq đang cooldown nên bị bỏ qua dù script của nó còn một câu trả lời đúng
    clock.advance(1000);
    expect(await chain.run(request)).toEqual(answerOf('gemini'));
    expect(groq.calls).toBe(1);
  });

  it('HDA-08: mỗi lần thử có hẹn giờ riêng và hẹn giờ luôn bị huỷ (thành công, lỗi, hết giờ)', async () => {
    const groq = new FakeProvider('groq', [fail('server', 500), ok(GOOD)]);
    const { chain, clock } = setup([groq]);

    expect(await chain.run(request)).toEqual(answerOf('groq'));
    expect(clock.startedDelays).toEqual([6000, 6000]);
    expect(clock.pendingCount).toBe(0);
  });
});

describe('FallbackChain: cooldown (HDA-09)', () => {
  it('HDA-09: sau lỗi, lớp bị bỏ qua trong 60 giây rồi được gọi lại; sau thành công không có cooldown', async () => {
    const groq = new FakeProvider('groq', [
      fail('server', 500),
      fail('server', 500),
      ok(GOOD),
      ok(GOOD),
    ]);
    const gemini = new FakeProvider('gemini', [ok(GOOD), ok(GOOD)]);
    const { chain, clock } = setup([groq, gemini]);

    // Lỗi hai lần (lần đầu và lần thử lại) ⇒ cooldown từ t = 0
    expect(await chain.run(request)).toEqual(answerOf('gemini'));
    expect(groq.calls).toBe(2);

    clock.advance(59_999);
    expect(await chain.run(request)).toEqual(answerOf('gemini'));
    expect(groq.calls).toBe(2); // trong 60 giây: bị bỏ qua

    clock.advance(1);
    expect(await chain.run(request)).toEqual(answerOf('groq'));
    expect(groq.calls).toBe(3); // sau 60 giây: được gọi lại và thành công

    // Thành công KHÔNG đặt cooldown: hỏi ngay lập tức, Groq vẫn được gọi
    expect(await chain.run(request)).toEqual(answerOf('groq'));
    expect(groq.calls).toBe(4);
  });

  it('HDA-09: cooldown tính từ lúc lần thử CUỐI hỏng, không phải lúc bắt đầu hỏi', async () => {
    const groq = new FakeProvider('groq', [hang(), hang(), ok(GOOD)]);
    const gemini = new FakeProvider('gemini', [ok(GOOD), ok(GOOD)]);
    const { chain, clock } = setup([groq, gemini]);

    // Groq hết giờ hai lần: lỗi cuối ở t = 12 giây, nên cooldown tới t = 72 giây
    expect(await drive(clock, chain.run(request))).toEqual(answerOf('gemini'));
    expect(clock.now()).toBe(12_000);

    clock.advance(59_999); // t = 71,999 giây
    expect(await chain.run(request)).toEqual(answerOf('gemini'));
    expect(groq.calls).toBe(2);

    clock.advance(1); // t = 72 giây
    expect(await chain.run(request)).toEqual(answerOf('groq'));
  });

  it('HDA-09: cooldown cấu hình được (AI_COOLDOWN_SECONDS)', async () => {
    const groq = new FakeProvider('groq', [fail('rejected', 401), ok(GOOD)]);
    const gemini = new FakeProvider('gemini', [ok(GOOD), ok(GOOD)]);
    const { chain, clock } = setup([groq, gemini], { cooldownMs: 5000 });

    expect(await chain.run(request)).toEqual(answerOf('gemini'));
    clock.advance(4999);
    expect(await chain.run(request)).toEqual(answerOf('gemini'));
    expect(groq.calls).toBe(1);
    clock.advance(1);
    expect(await chain.run(request)).toEqual(answerOf('groq'));
  });

  it('HDA-09: một lớp đang cooldown không kéo lớp kia vào cooldown', async () => {
    const groq = new FakeProvider('groq', [fail('rateLimited', 429)]);
    const gemini = new FakeProvider('gemini', [ok(GOOD), ok(GOOD)]);
    const { chain } = setup([groq, gemini]);

    await chain.run(request);
    await chain.run(request);
    expect(gemini.calls).toBe(2); // Gemini vẫn được gọi cả hai lần
  });
});
