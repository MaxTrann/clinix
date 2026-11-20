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

/**
 * Cài `fetch` giả dùng chung cho API Quản trị viên của ví (F7 rút tiền, F9 nạp ví chưa cộng): ghi lại mọi lời gọi; `route` chọn câu trả lời theo phương thức, đường dẫn (đã bỏ `/api`),
 * query và thân.
 */
export function installFakeAdminFetch(
  route: (req: AdminRequest) => AdminReply,
) {
  const requests: AdminRequest[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://web.invalid');
      const req: AdminRequest = {
        method: init?.method ?? 'GET',
        path: url.pathname.replace(/^\/api/, ''),
        query: Object.fromEntries(url.searchParams),
        body:
          typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      };
      requests.push(req);
      const reply = route(req);
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
    posts: () => requests.filter((r) => r.method === 'POST'),
    gets: (path: string) =>
      requests.filter((r) => r.method === 'GET' && r.path === path),
  };
}

export function installFakeAdminWithdrawalApi() {
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
  const fake = installFakeAdminFetch(({ path, query, body }) => {
    const [id, action] = path.slice(PREFIX.length + 1).split('/');
    if (path === PREFIX) return handlers.list(query);
    if (action === 'approve') return handlers.approve(id ?? '');
    if (action === 'reject') return handlers.reject(id ?? '', body);
    return handlers.detail(id ?? '');
  });
  return {
    ...fake,
    handlers,
    gets: (path = PREFIX) => fake.gets(path),
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
