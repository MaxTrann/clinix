import { setApiAuthHooks } from '../../../shared/api/auth-hooks';
import { LONG_TIMEOUT_MS } from '../../../shared/api/client';
import {
  ApiError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import { httpChatbotApi } from './chatbot-api';

// Chatbot F1, WTL-08: đúng MỘT lời gọi mỗi lần gửi, `skipAuthToken`, `LONG_TIMEOUT_MS`, thân và tên trường đúng PLAN 5.12.
// Nếp kiểm lời gọi theo `activation-service.test.ts`: stub `fetch`, và có sẵn một phiên đăng nhập để lời gọi quên `skipAuthToken` sẽ bị lộ.
const fetchMock = vi.fn<typeof fetch>();
const SESSION_ACCESS = `acc-${Math.random().toString(36).slice(2)}`;

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return {
    url: String(url),
    init: init!,
    headers: new Headers(init!.headers),
  };
}

const VALID_REPLY = {
  ketQua: 'TraLoi',
  doan: [{ kieu: 'chu', chu: 'Xin chào' }],
  chuyenKhoaGoiY: [],
  lienKet: [],
  coTheGuiLai: false,
  tinhVaoLichSu: true,
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setApiAuthHooks({
    getAccessToken: () => SESSION_ACCESS,
    recoverFromUnauthorized: async () => false,
  });
});

afterEach(() => {
  setApiAuthHooks(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('httpChatbotApi.ask', () => {
  it('WTL-08 POST /api/chatbot/messages, đúng một lời gọi, thân đúng tên trường, KHÔNG Authorization dù đang đăng nhập', async () => {
    fetchMock.mockResolvedValue(ok(VALID_REPLY));
    const body = {
      cauHoi: 'Phòng khám mở cửa lúc nào?',
      lichSu: [
        { vai: 'NguoiDung' as const, noiDung: 'Xin chào' },
        { vai: 'TroLy' as const, noiDung: 'Chào bạn' },
      ],
      chiNhanhId: '3',
    };

    await httpChatbotApi.ask(body, new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = lastCall();
    expect(call.url).toBe('/api/chatbot/messages');
    expect(call.init.method).toBe('POST');
    expect(call.init.credentials).toBe('same-origin');
    expect(call.headers.get('content-type')).toBe('application/json');
    expect(call.headers.get('authorization')).toBeNull();
    expect(JSON.parse(String(call.init.body))).toEqual(body);
  });

  it('WTL-08 thân chỉ có các trường người dùng truyền vào (không thêm trường lạ: máy chủ từ chối trường lạ)', async () => {
    fetchMock.mockResolvedValue(ok(VALID_REPLY));
    await httpChatbotApi.ask(
      { cauHoi: 'Chỉ có câu hỏi' },
      new AbortController().signal,
    );
    expect(JSON.parse(String(lastCall().init.body))).toEqual({
      cauHoi: 'Chỉ có câu hỏi',
    });
  });

  it('WTL-08 trả phản hồi đã qua kiểm hình dạng', async () => {
    fetchMock.mockResolvedValue(ok(VALID_REPLY));
    const result = await httpChatbotApi.ask(
      { cauHoi: 'a' },
      new AbortController().signal,
    );
    expect(result).toEqual(VALID_REPLY);
  });

  it('WTL-06 thân 200 sai hình dạng thì ném UnexpectedResponseError', async () => {
    fetchMock.mockResolvedValue(ok({ ketQua: 'TraLoi' }));
    await expect(
      httpChatbotApi.ask({ cauHoi: 'a' }, new AbortController().signal),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });

  it('WTL-06 lỗi 429 của máy chủ đi nguyên ApiError với `maLoi` (khung chọn chữ theo `maLoi`)', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ maLoi: 'TRO_LY_HOI_QUA_NHANH', thongBao: 'x' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const error = await httpChatbotApi
      .ask({ cauHoi: 'a' }, new AbortController().signal)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).maLoi).toBe('TRO_LY_HOI_QUA_NHANH');
  });

  it('WTL-08 hạn chờ là LONG_TIMEOUT_MS (45 giây): trước hạn còn chờ, đúng hạn thì TimeoutError', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const settled = vi.fn();
    const outcome = httpChatbotApi
      .ask({ cauHoi: 'a' }, new AbortController().signal)
      .then(
        () => 'xong',
        (error: unknown) => error,
      )
      .finally(settled);

    await vi.advanceTimersByTimeAsync(LONG_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toBeInstanceOf(TimeoutError);
    expect(LONG_TIMEOUT_MS).toBe(45_000);
  });
});
