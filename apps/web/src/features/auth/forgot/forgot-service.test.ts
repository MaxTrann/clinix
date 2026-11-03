import { setApiAuthHooks } from '../../../shared/api/auth-hooks';
import {
  DEFAULT_TIMEOUT_MS,
  LONG_TIMEOUT_MS,
} from '../../../shared/api/client';
import { TimeoutError } from '../../../shared/api/errors';
import {
  requestForgotCode,
  resendForgotCode,
  resetPassword,
  verifyForgotCode,
} from './forgot-service';

// Task F4. Mã ca QV-nn là [đề xuất]. Kiểm qua `fetch` (không giả `request`) để khoá đúng thứ đi ra mạng.
const fetchMock = vi.fn<typeof fetch>();

// Mạng treo: chỉ kết thúc khi tín hiệu huỷ của chính request bị kích hoạt (giống client.test.ts)
function hangUntilAborted(_url: RequestInfo | URL, init?: RequestInit) {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(new DOMException('Đã huỷ', 'AbortError'));
    });
  });
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), init: init!, headers: new Headers(init!.headers) };
}

const CALLS = [
  ['requestForgotCode', () => requestForgotCode('a@b.vn')],
  ['resendForgotCode', () => resendForgotCode('a@b.vn')],
  ['verifyForgotCode', () => verifyForgotCode('a@b.vn', '012345')],
  [
    'resetPassword',
    () =>
      resetPassword({
        resetToken: 'reset-1',
        matKhauMoi: 'Matkhau@1',
        xacNhan: 'Matkhau@1',
      }),
  ],
] as const;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // Như khi người dùng đang có phiên: request thường sẽ gắn token này
  setApiAuthHooks({
    getAccessToken: () => 'tok-dang-nhap',
    recoverFromUnauthorized: async () => false,
  });
});

afterEach(() => {
  setApiAuthHooks(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('cả bốn lời gọi công khai', () => {
  it.each(CALLS)(
    'QV-01 %s: POST, KHÔNG gắn Authorization dù đang có token',
    async (_name, call) => {
      fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
      await call();
      const { init, headers } = lastCall();
      expect(init.method).toBe('POST');
      expect(headers.has('Authorization')).toBe(false);
    },
  );
});

describe('hạn chờ', () => {
  it.each(CALLS.slice(0, 2))(
    'QV-02 %s gửi thư: hạn dài 45 giây, không bị huỷ ở 15 giây',
    async (_name, call) => {
      vi.useFakeTimers();
      fetchMock.mockImplementation(hangUntilAborted);
      const outcome = call().catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
      expect(lastCall().init.signal!.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(LONG_TIMEOUT_MS - DEFAULT_TIMEOUT_MS);
      expect(lastCall().init.signal!.aborted).toBe(true);
      expect(await outcome).toBeInstanceOf(TimeoutError);
    },
  );

  it.each(CALLS.slice(2))(
    'QV-03 %s không gửi thư: hạn mặc định 15 giây',
    async (_name, call) => {
      vi.useFakeTimers();
      fetchMock.mockImplementation(hangUntilAborted);
      const outcome = call().catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
      expect(await outcome).toBeInstanceOf(TimeoutError);
    },
  );
});
