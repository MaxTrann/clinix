import { vi } from 'vitest';
import { setApiAuthHooks } from '../../../shared/api/auth-hooks';

// API nhắn tin giả cho test web của chat F3 (hợp đồng PLAN chat 5.6): thay `fetch` toàn cục, KHÔNG gọi backend thật. "Máy chủ" trong bộ nhớ gồm danh sách
// hội thoại, chi tiết và tin của từng hội thoại; gửi tin chống trùng theo `maGui` như lõi (200 cùng thân khi gửi lại cùng mã). Mỗi lời gọi được ghi lại
// (đường dẫn, tham số, thân) để test đếm và kiểm. `replyNext` ghi đè lần gọi kế tiếp của một route (lỗi, mất mạng, treo). Dữ liệu giả.

export type FakeReply =
  { body: unknown; status?: number } | { network: true } | { hold: true };

export interface FakeChatRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

let nextMessageId = 1000;

/** Một dòng danh sách mẫu (đủ khoá của PLAN 5.6). */
export const conversation = (patch: Record<string, unknown> = {}) => ({
  id: '1',
  loai: 'BenhNhan_BacSi',
  doiTac: { vaiTro: 'BacSi', tenHienThi: 'BS. Trần Bình' },
  tinCuoi: {
    id: '10',
    trichDan: 'Chào bác sĩ',
    nguoiGuiHienThi: 'Bạn',
    thoiDiemGui: '2026-11-27T01:00:00.000Z',
  },
  soTinChuaDoc: 0,
  trangThaiTraLoi: null,
  traLoiBoi: null,
  quanHe: 'DaTungKham',
  ...patch,
});

export const detail = (patch: Record<string, unknown> = {}) => ({
  id: '1',
  loai: 'BenhNhan_BacSi',
  doiTac: { vaiTro: 'BacSi', tenHienThi: 'BS. Trần Bình' },
  quanHe: 'DaTungKham',
  banner: true,
  coTheGui: true,
  lyDoKhongGui: null,
  ...patch,
});

export const message = (patch: Record<string, unknown> = {}) => ({
  id: String((nextMessageId += 1)),
  laCuaToi: false,
  nguoiGui: { vaiTro: 'BacSi', tenHienThi: 'BS. Trần Bình' },
  noiDung: 'Nội dung mẫu',
  tep: null,
  thoiDiemGui: '2026-11-27T01:00:00.000Z',
  maGui: null,
  ...patch,
});

type Row = ReturnType<typeof conversation>;
type Detail = ReturnType<typeof detail>;
type Message = ReturnType<typeof message>;

const byId = (a: { id: string }, b: { id: string }) =>
  a.id.length - b.id.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export const apiError = (status: number, maLoi: string, extra = {}) => ({
  status,
  body: { maLoi, thongBao: 'câu của máy chủ', ...extra },
});

export function installFakeChatApi() {
  const requests: FakeChatRequest[] = [];
  const rows: Row[] = [];
  const details = new Map<string, Detail>();
  const threads = new Map<string, Message[]>();
  const overrides = new Map<string, FakeReply[]>();
  let release: ((reply: { body: unknown; status?: number }) => void) | null =
    null;

  /** Thêm một hội thoại có sẵn tin (tin tăng dần). */
  const seed = (
    id: string,
    {
      row = {},
      head = {},
      messages = [],
    }: {
      row?: Record<string, unknown>;
      head?: Record<string, unknown>;
      messages?: Message[];
    } = {},
  ) => {
    rows.push(conversation({ id, ...row }));
    details.set(id, detail({ id, ...head }));
    threads.set(id, [...messages].sort(byId));
  };

  const serve = (
    method: string,
    path: string,
    query: URLSearchParams,
    body: unknown,
  ): { body: unknown; status?: number } => {
    if (path === '/chat/unread-count')
      return { body: { soHoiThoaiChuaDoc: 0 } };
    if (method === 'GET' && path === '/chat/conversations') {
      const loc = query.get('loc') ?? 'tat-ca';
      const q = query.get('q');
      if (q !== null && q.trim().length < 2)
        return apiError(400, 'TU_KHOA_KHONG_HOP_LE');
      let list = rows.filter(
        (row) =>
          (loc !== 'chua-doc' || row.soTinChuaDoc > 0) &&
          (loc !== 'bac-si' || row.loai === 'BenhNhan_BacSi') &&
          (loc !== 'le-tan' || row.loai === 'BenhNhan_LeTan') &&
          (q === null || row.doiTac.tenHienThi.includes(q)),
      );
      const before = query.get('truoc');
      if (before !== null) {
        const at = list.findIndex((row) => row.tinCuoi.id === before);
        list = list.slice(at + 1);
      }
      const limit = Number(query.get('limit') ?? 20);
      const page = list.slice(0, limit);
      return {
        body: {
          items: page,
          truocTiepTheo:
            list.length > limit ? (page.at(-1)?.tinCuoi.id ?? null) : null,
        },
      };
    }
    const match = /^\/chat\/conversations\/([^/]+)(\/messages|\/read)?$/.exec(
      path,
    );
    const id = match?.[1] ?? '';
    const thread = threads.get(id);
    if (!match || !thread) return apiError(404, 'KHONG_TIM_THAY');
    if (method === 'GET' && match[2] === undefined)
      return { body: details.get(id) };
    if (method === 'GET' && match[2] === '/messages') {
      const limit = Number(query.get('limit') ?? 30);
      const after = query.get('sau');
      const before = query.get('truoc');
      if (after !== null) {
        const newer = thread.filter((m) => byId(m, { id: after }) > 0);
        return {
          body: { items: newer.slice(0, limit), coThem: newer.length > limit },
        };
      }
      const older =
        before === null
          ? thread
          : thread.filter((m) => byId(m, { id: before }) < 0);
      return {
        body: { items: older.slice(-limit), coThem: older.length > limit },
      };
    }
    if (method === 'POST' && match[2] === '/read') {
      const { tinNhanId } = body as { tinNhanId: string };
      return { body: { tinNhanCuoiDaDocId: tinNhanId } };
    }
    if (method === 'POST' && match[2] === '/messages') {
      const { noiDung, maGui } = body as { noiDung: string; maGui: string };
      const existing = thread.find((m) => m.maGui === maGui);
      if (existing)
        return { status: 200, body: { hoiThoaiId: id, tinNhan: existing } };
      const created = message({
        laCuaToi: true,
        nguoiGui: { vaiTro: 'BenhNhan', tenHienThi: 'Bạn' },
        noiDung: noiDung.trim(),
        maGui,
        thoiDiemGui: new Date().toISOString(),
      });
      thread.push(created);
      return { status: 201, body: { hoiThoaiId: id, tinNhan: created } };
    }
    return apiError(404, 'KHONG_TIM_THAY');
  };

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://web.invalid');
      const method = init?.method ?? 'GET';
      const path = url.pathname.replace(/^\/api/, '');
      const body =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as unknown)
          : null;
      requests.push({ method, path, query: url.searchParams, body });
      const reply =
        overrides.get(`${method} ${path}`)?.shift() ??
        serve(method, path, url.searchParams, body);
      if ('network' in reply) throw new TypeError('Failed to fetch');
      const settled =
        'hold' in reply
          ? await new Promise<{ body: unknown; status?: number }>(
              (resolve, reject) => {
                release = resolve;
                init?.signal?.addEventListener('abort', () =>
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
    rows,
    threads,
    details,
    seed,
    /** Lần gọi kế tiếp tới `METHOD path` dùng phản hồi này (ví dụ `'POST /chat/conversations/1/messages'`). */
    replyNext(route: string, reply: FakeReply) {
      overrides.set(route, [...(overrides.get(route) ?? []), reply]);
    },
    callsTo(method: string, path: string) {
      return requests.filter((r) => r.method === method && r.path === path);
    },
    /** Trả lời lời gọi đang treo (`{ hold: true }`) bằng phản hồi truyền vào. */
    release(reply: { body: unknown; status?: number }) {
      if (!release) throw new Error('Không có lời gọi nào đang treo');
      release(reply);
      release = null;
    },
  };
}

export function cleanUpFakeChatApi() {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setApiAuthHooks(null);
}
