import { vi } from 'vitest';
import { setApiAuthHooks } from '../../../shared/api/auth-hooks';

// API giả cho màn "Quản lý tài chính ví" (payment F7): thay `fetch` toàn cục, KHÔNG gọi backend thật. Dữ liệu giả.
// Mỗi lời gọi được ghi lại (phương thức, đường dẫn, query, thân) để test kiểm cái đã gửi.

export type AdminReply =
  | { body: unknown; status?: number }
  | { network: true }
  // Treo tới khi test tự gọi `release`
  | { hold: Promise<{ body: unknown; status?: number }> };

export interface AdminRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
}

export const item = (patch: Record<string, unknown> = {}) => ({
  maYeuCau: '12',
  benhNhan: { hoTen: 'Trần Văn C' },
  soTien: '100000.00',
  trangThai: 'ChoDuyet',
  thoiDiemYeuCau: '2026-10-16T03:30:00.000Z',
  thoiDiemXuLy: null,
  ...patch,
});

export const COUNTS = { tatCa: 5, choDuyet: 3, daDuyet: 1, tuChoi: 1 };

export const listPage = (
  items: unknown[],
  patch: Record<string, unknown> = {},
) => ({
  items,
  total: items.length,
  trang: 1,
  kichThuoc: 20,
  demTheoTrangThai: COUNTS,
  ...patch,
});

export const detail = (patch: Record<string, unknown> = {}) => ({
  ...item(),
  soDuHienTai: '1000000.00',
  soTienDangGiu: '300000.00',
  giaoDichGanDay: [
    {
      thoiDiem: '2026-10-01T03:00:00.000Z',
      loai: 'Nap',
      soTien: '500000.00',
    },
  ],
  ...patch,
});

export const adminError = (status: number, maLoi: string): AdminReply => ({
  status,
  body: { maLoi, thongBao: 'câu của máy chủ' },
});

const PREFIX = '/admin/wallet/withdrawals';

export function installFakeAdminWithdrawalApi() {
  const requests: AdminRequest[] = [];
  const handlers = {
    list: (query: Record<string, string>): AdminReply => {
      void query;
      return { body: listPage([item()]) };
    },
    detail: (id: string): AdminReply => {
      void id;
      return { body: detail() };
    },
    approve: (id: string): AdminReply => ({
      body: { maYeuCau: id, trangThai: 'DaDuyet' },
    }),
    reject: (id: string, body: unknown): AdminReply => {
      void body;
      return { body: { maYeuCau: id, trangThai: 'TuChoi' } };
    },
  };

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://web.invalid');
      const path = url.pathname.replace(/^\/api/, '');
      const method = init?.method ?? 'GET';
      const body: unknown =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      const query = Object.fromEntries(url.searchParams);
      requests.push({ method, path, query, body });

      const [id, action] = path.slice(PREFIX.length + 1).split('/');
      let reply: AdminReply;
      if (path === PREFIX) reply = handlers.list(query);
      else if (action === 'approve') reply = handlers.approve(id ?? '');
      else if (action === 'reject') reply = handlers.reject(id ?? '', body);
      else reply = handlers.detail(id ?? '');

      if ('network' in reply) throw new TypeError('Failed to fetch');
      const settled =
        'hold' in reply ? await untilAborted(reply.hold, init?.signal) : reply;
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
    handlers,
    posts: () => requests.filter((r) => r.method === 'POST'),
    gets: (path = PREFIX) =>
      requests.filter((r) => r.method === 'GET' && r.path === path),
  };
}

/** Treo nhưng ném `AbortError` khi client huỷ (hết giờ 15 giây), như trình duyệt thật. */
function untilAborted<T>(
  work: Promise<T>,
  signal: AbortSignal | null | undefined,
): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    signal.addEventListener(
      'abort',
      () => reject(new DOMException('Aborted', 'AbortError')),
      { once: true },
    );
    work.then(resolve, reject);
  });
}

export function cleanUpFakeAdminWithdrawalApi() {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  setApiAuthHooks(null);
}
