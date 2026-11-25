import { vi } from 'vitest';
import { setApiAuthHooks } from '../../../shared/api/auth-hooks';

// API thông báo giả cho test web của notification F1, F2 (PLAN 5.4): thay `fetch` toàn cục, KHÔNG gọi backend thật. Mỗi lời gọi được ghi lại để test đếm số lần gọi
// và kiểm đã gắn token. `unread-count`: phản hồi lấy lần lượt từ `replies`; hết hàng đợi thì trả số chưa đọc của `inbox` (hay `fallback` khi `inbox` rỗng).
// F2: `inbox` là "máy chủ" trong bộ nhớ (mới nhất trước) cho danh sách, `POST :id/read` và `POST read-all`; `routeReplies` ghi đè lần gọi kế tiếp của từng đường dẫn.
// Dữ liệu giả.

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

/** Một dòng thông báo mẫu (đủ tám khoá của PLAN 5.4). */
export const notice = (patch: Record<string, unknown> = {}) => ({
  id: '1',
  loai: 'NapViThanhCong',
  nhom: 'Vi',
  tieuDe: 'Nạp ví thành công',
  noiDung: 'Bạn đã nạp 200.000 đ vào ví.',
  daDoc: false,
  thoiDiemTao: '2026-11-20T01:00:00.000Z',
  lienKet: { kieu: 'Vi' },
  ...patch,
});

type Row = ReturnType<typeof notice>;

export const unread = (
  soChuaDoc: number,
): { body: unknown; status?: number } => ({
  body: { soChuaDoc },
});

export function installFakeNotificationApi(fallback = 0) {
  const requests: FakeNotificationRequest[] = [];
  const replies: FakeUnreadReply[] = [];
  const inbox: Row[] = [];
  const routeReplies = new Map<string, FakeUnreadReply[]>();
  const unreadOf = () => inbox.filter((row) => !row.daDoc).length;

  // Hành vi "máy chủ" của từng đường dẫn khi không có phản hồi ghi đè
  const serve = (
    method: string,
    path: string,
    query: URLSearchParams,
  ): { body: unknown; status?: number } => {
    if (path === '/notifications/unread-count')
      return unread(inbox.length > 0 ? unreadOf() : fallback);
    if (method === 'GET' && path === '/notifications') {
      const page = Number(query.get('page') ?? 1);
      const pageSize = Number(query.get('pageSize') ?? 20);
      const filter = query.get('trangThaiDoc') ?? 'tat-ca';
      const rows = inbox.filter(
        (row) => filter === 'tat-ca' || row.daDoc === (filter === 'da-doc'),
      );
      return {
        body: {
          items: rows.slice((page - 1) * pageSize, page * pageSize),
          total: rows.length,
          page,
          pageSize,
          soChuaDoc: unreadOf(),
        },
      };
    }
    if (method === 'POST' && path === '/notifications/read-all') {
      const daDanhDau = unreadOf();
      for (const row of inbox) row.daDoc = true;
      return { body: { daDanhDau, soChuaDoc: 0 } };
    }
    const read = /^\/notifications\/([^/]+)\/read$/.exec(path);
    if (method === 'POST' && read) {
      const row = inbox.find((item) => item.id === read[1]);
      if (!row) return apiError(404, 'KHONG_TIM_THAY') as { body: unknown };
      row.daDoc = true;
      return { body: { id: row.id, daDoc: true, soChuaDoc: unreadOf() } };
    }
    return apiError(404, 'KHONG_TIM_THAY') as { body: unknown };
  };
  let release: ((reply: { body: unknown; status?: number }) => void) | null =
    null;

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://web.invalid');
      const signal = init?.signal ?? null;
      const method = init?.method ?? 'GET';
      const path = url.pathname.replace(/^\/api/, '');
      requests.push({
        method,
        path,
        authorization: new Headers(init?.headers).get('Authorization'),
        signal,
      });
      const queued =
        path === '/notifications/unread-count'
          ? replies.shift()
          : routeReplies.get(`${method} ${path}`)?.shift();
      const reply = queued ?? serve(method, path, url.searchParams);
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
    inbox,
    fetchMock,
    /** Lần gọi kế tiếp tới `METHOD path` dùng phản hồi này (ví dụ `'POST /notifications/7/read'`). */
    replyNext(route: string, reply: FakeUnreadReply) {
      routeReplies.set(route, [...(routeReplies.get(route) ?? []), reply]);
    },
    /** Các lời gọi tới một đường dẫn (bỏ `unread-count` của thăm dò khi cần đếm riêng). */
    callsTo(method: string, path: string) {
      return requests.filter((r) => r.method === method && r.path === path);
    },
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
