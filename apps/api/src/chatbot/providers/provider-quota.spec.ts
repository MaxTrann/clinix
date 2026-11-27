import { FakeClock } from '../testing/fake-clock.js';
import { ProviderQuota } from './provider-quota.js';

// chatbot P1 — trần "mỗi phút" theo nhà cung cấp (hỗ trợ HDA-11): cửa sổ trượt 60 giây, biên đúng 60 giây.
function build(groq = 2, gemini = 2) {
  const clock = new FakeClock();
  return { clock, quota: new ProviderQuota({ groq, gemini }, clock) };
}

describe('ProviderQuota', () => {
  it('cho đúng `limit` lời gọi trong 60 giây, lời gọi kế tiếp bị từ chối', () => {
    const { quota } = build(2);
    expect(quota.tryAcquire('groq')).toBe(true);
    expect(quota.tryAcquire('groq')).toBe(true);
    expect(quota.tryAcquire('groq')).toBe(false);
  });

  it('biên: suất hết hạn đúng sau 60 giây (59,999 giây vẫn chặn, 60 giây thì cho)', () => {
    const { quota, clock } = build(2);
    quota.tryAcquire('groq');
    quota.tryAcquire('groq');

    clock.advance(59_999);
    expect(quota.tryAcquire('groq')).toBe(false);
    clock.advance(1);
    expect(quota.tryAcquire('groq')).toBe(true);
  });

  it('cửa sổ TRƯỢT: suất của các lời gọi lệch thời gian hết hạn lần lượt', () => {
    const { quota, clock } = build(2);
    quota.tryAcquire('groq'); // t = 0
    clock.advance(30_000);
    quota.tryAcquire('groq'); // t = 30 giây
    expect(quota.tryAcquire('groq')).toBe(false);

    clock.advance(30_000); // t = 60 giây: lời gọi ở t = 0 hết hạn, lời gọi ở t = 30 giây còn
    expect(quota.tryAcquire('groq')).toBe(true);
    expect(quota.tryAcquire('groq')).toBe(false);
  });

  it('lời gọi bị từ chối KHÔNG tiêu suất và không kéo dài cửa sổ', () => {
    const { quota, clock } = build(1);
    expect(quota.tryAcquire('groq')).toBe(true); // t = 0
    clock.advance(30_000);
    expect(quota.tryAcquire('groq')).toBe(false); // bị từ chối ở t = 30 giây
    clock.advance(30_000); // t = 60 giây
    expect(quota.tryAcquire('groq')).toBe(true);
  });

  it('đếm riêng từng nhà cung cấp, mỗi nơi theo trần của mình', () => {
    const { quota } = build(1, 3);
    expect(quota.tryAcquire('groq')).toBe(true);
    expect(quota.tryAcquire('groq')).toBe(false);
    expect(quota.tryAcquire('gemini')).toBe(true);
    expect(quota.tryAcquire('gemini')).toBe(true);
    expect(quota.tryAcquire('gemini')).toBe(true);
    expect(quota.tryAcquire('gemini')).toBe(false);
  });
});
