import { vi } from 'vitest';
import { setApiAuthHooks } from '../../../shared/api/auth-hooks';

// API thông báo giả cho test web của notification F1 (PLAN 5.4): thay `fetch` toàn cục, KHÔNG gọi backend thật. Mỗi lời gọi được ghi lại để test đếm số lần gọi
// và kiểm đã gắn token. Phản hồi lấy lần lượt từ `replies`; hết hàng đợi thì trả `{ soChuaDoc: fallback }`.

export type FakeUnreadReply =
  | { body: unknown; status?: number }
  // Mất mạng: `fetch` ném lỗi như trình duyệt
  | { network: true }
  // Treo tới khi test tự gọi `release()` hoặc lời gọi bị huỷ
  | { hold: true };

export interface FakeNotificationRequest {
  method: string;
  path: string;
  authorization: string | null;
  signal: AbortSignal | null;
}

export const unread = (
  soChuaDoc: number,
): { body: unknown; status?: number } => ({
  body: { soChuaDoc },
});

export function installFakeNotificationApi(fallback = 0) {
  const requests: FakeNotificationRequest[] = [];
  const replies: FakeUnreadReply[] = [];
  let release: ((reply: { body: unknown; status?: number }) => void) | null =
    null;

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://web.invalid');
      const signal = init?.signal ?? null;
      requests.push({
        method: init?.method ?? 'GET',
        path: url.pathname.replace(/^\/api/, ''),
        authorization: new Headers(init?.headers).get('Authorization'),
        signal,
      });
      const reply = replies.shift() ?? unread(fallback);
      if ('network' in reply) throw new TypeError('Failed to fetch');
      const settled =
        'hold' in reply
          ? await new Promise<{ body: unknown; status?: number }>(
              (resolve, reject) => {
                release = resolve;
                signal?.addEventListener('abort', () =>
                  reject(new DOMException('Aborted', 'AbortError')),
                );
              },
            )
          : reply;
      return new Response(JSON.stringify(settled.body), {
        status: settled.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  );

  setApiAuthHooks({
    getAccessToken: () => 'token-gia',
    recoverFromUnauthorized: async () => false,
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    requests,
    replies,
    fetchMock,
    /** Trả lời lời gọi đang treo (`{ hold: true }`). */
    release(reply: { body: unknown; status?: number } = unread(fallback)) {
      if (!release) throw new Error('Không có lời gọi nào đang treo');
      release(reply);
      release = null;
    },
  };
}

export function cleanUpFakeNotificationApi() {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setApiAuthHooks(null);
}

/** Lỗi chuẩn của API (thân JSON `maLoi`, `thongBao`). */
export const apiError = (status: number, maLoi: string): FakeUnreadReply => ({
  status,
  body: { maLoi, thongBao: 'câu của máy chủ' },
});
