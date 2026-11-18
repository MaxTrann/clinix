// API kích hoạt giả ở mức HỢP ĐỒNG B16 (TRACKING admin 9A.5 mục 1.13): `validate` ⇒ 200 `{ hopLe: true }`, `complete` ⇒ 200 `{ daKichHoat: true }`,
// mọi lý do liên kết không dùng được ⇒ 400 `LIEN_KET_KHONG_HOP_LE`, mật khẩu sai ⇒ 400 `DU_LIEU_KHONG_HOP_LE` kèm `loi[{ truong, ma }]`.
// Ghi lại mọi lời gọi (kể cả tới đường khác, để test khẳng định "không gọi /auth/*").

export const VALIDATE_URL = '/api/staff-activation/validate';
export const COMPLETE_URL = '/api/staff-activation/complete';

export interface ActivationCall {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
  signal: AbortSignal | null | undefined;
}

type Handler = () => Response | Promise<Response>;

export const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const invalidLinkResponse = (status = 400) =>
  jsonResponse(status, {
    maLoi: 'LIEN_KET_KHONG_HOP_LE',
    thongBao: 'CÂU CỦA API',
  });

export const fieldErrorsResponse = (loi: { truong: string; ma: string }[]) =>
  jsonResponse(400, {
    maLoi: 'DU_LIEU_KHONG_HOP_LE',
    thongBao: 'CÂU CỦA API',
    loi,
  });

export const htmlResponse = (status: number) =>
  new Response('<html><body>Bad Gateway</body></html>', {
    status,
    headers: { 'Content-Type': 'text/html' },
  });

function defaultResponse(url: string): Response {
  if (url === VALIDATE_URL) return jsonResponse(200, { hopLe: true });
  if (url === COMPLETE_URL) return jsonResponse(200, { daKichHoat: true });
  return jsonResponse(404, { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' });
}

// Lời gọi đã bị nơi gọi huỷ thì phản hồi về sau không còn ý nghĩa: giống `fetch` thật, nó từ chối bằng AbortError
function withAbort(
  response: Promise<Response>,
  signal: AbortSignal | null | undefined,
): Promise<Response> {
  if (!signal) return response;
  return new Promise<Response>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Đã huỷ', 'AbortError'));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    response.then(resolve, reject);
  });
}

export function createFakeActivationApi() {
  const calls: ActivationCall[] = [];
  const queued = new Map<string, Handler[]>();

  const api = {
    calls,
    callsTo(which: 'validate' | 'complete'): ActivationCall[] {
      const url = which === 'validate' ? VALIDATE_URL : COMPLETE_URL;
      return calls.filter((call) => call.url === url);
    },
    // Lần gọi kế tiếp tới `url` dùng `handler` thay cho phản hồi mặc định
    failNext(url: string, handler: Handler) {
      queued.set(url, [...(queued.get(url) ?? []), handler]);
    },
    // Giữ lần gọi kế tiếp tới `url` ở trạng thái "đang bay" cho tới khi `release`
    holdNext(url: string) {
      let release!: (response?: Response) => void;
      const gate = new Promise<Response>((resolve) => {
        release = (response) => resolve(response ?? defaultResponse(url));
      });
      api.failNext(url, () => gate);
      return { release };
    },
    fetch: vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
        body:
          typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        signal: init?.signal,
      });
      const handler = queued.get(url)?.shift();
      const response = Promise.resolve(
        handler ? handler() : defaultResponse(url),
      );
      return withAbort(response, init?.signal);
    }),
  };
  return api;
}
