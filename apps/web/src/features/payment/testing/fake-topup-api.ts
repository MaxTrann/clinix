import { vi } from 'vitest';
import { setApiAuthHooks } from '../../../shared/api/auth-hooks';

// API nạp ví giả cho test web của payment F2: thay `fetch` toàn cục, KHÔNG gọi backend thật. Dữ liệu giả. Mỗi lời gọi được ghi lại (phương thức, đường dẫn, thân).

export type TopupReply =
  | { body: unknown; status?: number }
  // Mất mạng: `fetch` ném lỗi
  | { network: true }
  // Treo tới khi test gọi `resolve` (để thấy trạng thái đang gửi)
  | { hold: Promise<{ body: unknown; status?: number }> };

export interface TopupCall {
  method: string;
  path: string;
  body: unknown;
}

export const SANDBOX_URL =
  'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=42&vnp_SecureHash=abc';

export const statusBody = (patch: Record<string, unknown> = {}) => ({
  maGiaoDich: '42',
  soTien: '200000.00',
  phuongThuc: 'VNPay',
  trangThai: 'DangXuLy',
  daCongVi: false,
  thoiDiemTao: '2026-11-18T12:02:20.000Z',
  ...patch,
});

export const apiError = (status: number, maLoi: string): TopupReply => ({
  status,
  body: { maLoi, thongBao: 'câu của máy chủ' },
});

function withAbort<T>(
  work: Promise<T>,
  signal: AbortSignal | null | undefined,
): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject);
  });
}

export function installFakeTopupApi() {
  const calls: TopupCall[] = [];
  const handlers = {
    create: (): TopupReply => ({
      status: 201,
      body: { maGiaoDich: '42', redirectUrl: SANDBOX_URL },
    }),
    status: (id: string): TopupReply => ({
      body: statusBody({ maGiaoDich: id }),
    }),
  };

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://web.invalid');
      const path = url.pathname.replace(/^\/api/, '');
      const method = init?.method ?? 'GET';
      calls.push({
        method,
        path,
        body:
          typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      let reply: TopupReply;
      const match = /^\/patient\/wallet\/topups\/(.+)$/.exec(path);
      if (method === 'POST' && path === '/patient/wallet/topups')
        reply = handlers.create();
      else if (method === 'GET' && match)
        reply = handlers.status(decodeURIComponent(match[1] ?? ''));
      else reply = apiError(404, 'KHONG_TIM_THAY');

      if ('network' in reply) throw new TypeError('Failed to fetch');
      // Như `fetch` thật: bị huỷ (client hết giờ) thì từ chối ngay, kể cả khi phản hồi đang treo
      const settled =
        'hold' in reply ? await withAbort(reply.hold, init?.signal) : reply;
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
  return { calls, handlers, fetchMock };
}

export function cleanUpFakeTopupApi() {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setApiAuthHooks(null);
}
