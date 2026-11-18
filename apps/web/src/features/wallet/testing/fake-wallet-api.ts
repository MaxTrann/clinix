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
  path: string;
  query: Record<string, string>;
  authorization: string | null;
}

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

export function installFakeWalletApi() {
  const requests: FakeRequest[] = [];
  const handlers = {
    overview: (): FakeReply => ({ body: OVERVIEW }),
    transactions: (query: Record<string, string>): FakeReply => {
      void query;
      return { body: page([tx()]) };
    },
  };

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://web.invalid');
      const query = Object.fromEntries(url.searchParams);
      const path = url.pathname.replace(/^\/api/, '');
      requests.push({
        path,
        query,
        authorization: new Headers(init?.headers).get('Authorization'),
      });
      let reply: FakeReply;
      if (path === '/patient/wallet') reply = handlers.overview();
      else if (path === '/patient/wallet/transactions')
        reply = handlers.transactions(query);
      else
        reply = {
          body: { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' },
          status: 404,
        };

      if ('network' in reply) throw new TypeError('Failed to fetch');
      const settled = 'hold' in reply ? await reply.hold : reply;
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
