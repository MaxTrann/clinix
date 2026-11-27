import { buildSampleRequest } from './sample-request.js';
import { FakeProvider, fail, hang, ok, throws } from './fake-provider.js';
import { settle } from './fake-clock.js';

// chatbot P1 — đồ giả tự kiểm (nếp mail/testing/*.spec.ts).
const generate = (provider: FakeProvider) =>
  provider.generate(buildSampleRequest(), new AbortController().signal);

describe('FakeProvider', () => {
  it('mỗi lời gọi lấy một bước của kịch bản theo thứ tự và được đếm', async () => {
    const provider = new FakeProvider('groq', [
      ok('a'),
      fail('rateLimited', 429),
    ]);

    await expect(generate(provider)).resolves.toEqual({ text: 'a' });
    await expect(generate(provider)).rejects.toMatchObject({
      kind: 'rateLimited',
      httpStatus: 429,
    });
    expect(provider.calls).toBe(2);
    expect(provider.signals).toHaveLength(2);
    expect(provider.requests).toHaveLength(2);
  });

  it('hết kịch bản thì lỗi 500 (ca nào gọi quá dự kiến sẽ đỏ rõ ràng)', async () => {
    const provider = new FakeProvider('gemini');
    await expect(generate(provider)).rejects.toMatchObject({
      kind: 'server',
      httpStatus: 500,
    });
  });

  it('bước throws ném đúng lỗi; bước hang không bao giờ xong', async () => {
    const provider = new FakeProvider('groq', [
      throws(new TypeError('x')),
      hang(),
    ]);
    await expect(generate(provider)).rejects.toBeInstanceOf(TypeError);

    let settled = false;
    void generate(provider).finally(() => (settled = true));
    await settle();
    expect(settled).toBe(false);
  });

  it('`configured` mặc định true và đặt được false', () => {
    expect(new FakeProvider('groq').configured).toBe(true);
    expect(new FakeProvider('groq', [], false).configured).toBe(false);
  });
});
