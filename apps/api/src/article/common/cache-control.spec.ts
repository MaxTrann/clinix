import type { IncomingMessage, ServerResponse } from 'node:http';
import { noCache } from './cache-control.js';

// article B2 — ABP-07 / T10 (mức đơn vị): middleware đặt `Cache-Control: no-cache` cho route công khai; hai ca HTTP của header nằm ở e2e `article-public.e2e-spec.ts`.
describe('article B2 — noCache (T10, ABP-07)', () => {
  it('ABP-07: đặt đúng Cache-Control: no-cache rồi gọi next đúng một lần', () => {
    const setHeader = vi.fn();
    const next = vi.fn();
    noCache(
      {} as IncomingMessage,
      { setHeader } as unknown as ServerResponse,
      next,
    );
    expect(setHeader).toHaveBeenCalledTimes(1);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('ABP-07 (ca âm): không bao giờ đặt no-store (route công khai phải cho phép hỏi lại và nhận 304)', () => {
    const setHeader = vi.fn();
    noCache(
      {} as IncomingMessage,
      { setHeader } as unknown as ServerResponse,
      vi.fn(),
    );
    for (const call of setHeader.mock.calls)
      expect(String(call[1])).not.toContain('no-store');
  });
});
