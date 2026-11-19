import { vi } from 'vitest';
import { setApiAuthHooks } from '../../../shared/api/auth-hooks';

// API ví giả cho test web của payment F1: thay `fetch` toàn cục, KHÔNG gọi backend thật. Dữ liệu giả.
// Mỗi lời gọi được ghi lại (đường dẫn + query) để test kiểm cái đã gửi.

export type FakeReply =
  // Trả JSON với mã HTTP (mặc định 200)
  | { body: unknown; status?: number }
  // Mất mạng: `fetch` ném lỗi
  | { network: true }
  // Treo tới khi test tự gọi `release` (để thấy trạng thái đang tải)
  | { hold: Promise<{ body: unknown; status?: number }> };

export interface FakeRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  /** Thân JSON đã gửi (payment F6), `undefined` nếu không có thân. */
  body: unknown;
  authorization: string | null;
}

/** Phản hồi 201 mẫu của rút tiền (payment F6): ví 350.000, rút 100.000. */
export const CREATED_WITHDRAWAL = {
  maYeuCau: '17',
  soTien: '100000.00',
  soDuKhaDung: '250000.00',
  soTienDangGiu: '100000.00',
};

export const OVERVIEW = {
  soDuKhaDung: '350000.00',
  soTienDangGiu: '0.00',
  soDu: '350000.00',
  napChoXacNhan: '0.00',
  yeuCauRutGanNhat: null,
  hanMucNap: { toiThieu: '50000.00', toiDa: '2000000.00' },
  congThanhToan: ['VNPay'],
};

export const tx = (patch: Record<string, unknown> = {}) => ({
  id: 'vi-1',
  thoiDiem: '2026-10-08T01:05:00.000Z',
  loai: 'ThanhToan',
  noiDung: 'Thanh toán đặt cọc lịch hẹn CP20261008009',
  soTien: '-100000.00',
  trangThai: 'ThanhCong',
  quaCuaSo: false,
  ...patch,
});

export const page = (
  items: unknown[],
  patch: Record<string, unknown> = {},
) => ({ items, total: items.length, trang: 1, kichThuoc: 20, ...patch });

/** Chờ `work`, nhưng ném `AbortError` ngay khi `signal` bị huỷ. */
function abortable<T>(
  work: Promise<T>,
  signal: AbortSignal | null | undefined,
): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) stop();
    signal.addEventListener('abort', stop, { once: true });
    work.then(resolve, reject);
  });
}

/** Lỗi chuẩn của API với mã nghiệp vụ (payment F6). */
export const apiError = (
  status: number,
  maLoi: string,
  chiTiet?: unknown,
): FakeReply => ({
  status,
  body: { maLoi, thongBao: 'câu của máy chủ', chiTiet },
});

export function installFakeWalletApi() {
  const requests: FakeRequest[] = [];
  const handlers = {
    overview: (): FakeReply => ({ body: OVERVIEW }),
    transactions: (query: Record<string, string>): FakeReply => {
      void query;
      return { body: page([tx()]) };
    },
    withdraw: (body: unknown): FakeReply => {
      void body;
      return { body: CREATED_WITHDRAWAL, status: 201 };
    },
  };

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://web.invalid');
      const query = Object.fromEntries(url.searchParams);
      const path = url.pathname.replace(/^\/api/, '');
      const method = init?.method ?? 'GET';
      const body: unknown =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      requests.push({
        method,
        path,
        query,
        body,
        authorization: new Headers(init?.headers).get('Authorization'),
      });
      let reply: FakeReply;
      if (method === 'POST' && path === '/patient/wallet/withdrawals')
        reply = handlers.withdraw(body);
      else if (path === '/patient/wallet') reply = handlers.overview();
      else if (path === '/patient/wallet/transactions')
        reply = handlers.transactions(query);
      else
        reply = {
          body: { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' },
          status: 404,
        };

      if ('network' in reply) throw new TypeError('Failed to fetch');
      // Treo mà client huỷ (hết giờ 15 giây) thì `fetch` phải ném như trình duyệt thật (payment F6, WRT-03)
      const settled =
        'hold' in reply ? await abortable(reply.hold, init?.signal) : reply;
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
  return { requests, handlers, fetchMock };
}

export function cleanUpFakeWalletApi() {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setApiAuthHooks(null);
}

// Lỗi chuẩn của API (thân JSON `maLoi`, `thongBao`)
export const serverError = (): FakeReply => ({
  body: { maLoi: 'LOI_HE_THONG', thongBao: 'Lỗi hệ thống' },
  status: 500,
});
