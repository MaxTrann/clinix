import { setApiAuthHooks } from '../../../shared/api/auth-hooks';
import { LONG_TIMEOUT_MS } from '../../../shared/api/client';
import {
  ApiError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import { httpChatbotApi } from '../api/chatbot-api';
import { suggestion } from '../testing/suggestion-fixtures';

// Chatbot F2, F2-05 và F2-06: `httpChatbotApi.suggest` và `listSpecialties` đúng đường dẫn, tham số, `skipAuthToken`, hạn chờ; chỉ ĐỌC (GET).
// Nếp kiểm lời gọi như `chatbot-api.test.ts`: stub `fetch` và có sẵn một phiên đăng nhập để lời gọi quên `skipAuthToken` sẽ bị lộ.
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

describe('httpChatbotApi.suggest', () => {
  it('F2-05 GET /api/chatbot/suggestions đủ bốn tham số, đúng một lời gọi, KHÔNG Authorization dù đang đăng nhập, không có thân', async () => {
    fetchMock.mockResolvedValue(ok(suggestion()));

    await httpChatbotApi.suggest(
      { chuyenKhoaId: '3', chiNhanhId: '2', ngay: '2026-11-28', ca: 'CaSang' },
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = lastCall();
    const url = new URL(call.url, 'http://localhost');
    expect(url.pathname).toBe('/api/chatbot/suggestions');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      chuyenKhoaId: '3',
      chiNhanhId: '2',
      ngay: '2026-11-28',
      ca: 'CaSang',
    });
    expect(call.init.method).toBe('GET');
    expect(call.init.credentials).toBe('same-origin');
    expect(call.init.body).toBeUndefined();
    expect(call.headers.get('authorization')).toBeNull();
  });

  it('F2-05 tham số vắng bị BỎ khỏi query (không gửi rỗng): chỉ có chuyên khoa thì máy chủ tự chọn ngày sớm nhất', async () => {
    fetchMock.mockResolvedValue(ok(suggestion()));
    await httpChatbotApi.suggest(
      { chuyenKhoaId: '3' },
      new AbortController().signal,
    );
    expect(lastCall().url).toBe('/api/chatbot/suggestions?chuyenKhoaId=3');
  });

  it('F2-05 trả kết quả đã qua bộ phân tích (danh sách trắng)', async () => {
    const raw = suggestion();
    fetchMock.mockResolvedValue(
      ok({ ...raw, bacSi: raw.bacSi.map((d) => ({ ...d, hocVi: 'TS' })) }),
    );
    const result = await httpChatbotApi.suggest(
      { chuyenKhoaId: '3' },
      new AbortController().signal,
    );
    expect(result).toEqual(raw);
    expect(JSON.stringify(result)).not.toContain('hocVi');
  });

  it('F2-05 thân 200 sai hình dạng thì ném UnexpectedResponseError', async () => {
    fetchMock.mockResolvedValue(ok({ chuyenKhoa: {} }));
    await expect(
      httpChatbotApi.suggest(
        { chuyenKhoaId: '3' },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });

  it('F2-05 lỗi 404, 409 đi nguyên ApiError với `maLoi` (thẻ chọn chữ theo `maLoi`)', async () => {
    for (const [status, maLoi] of [
      [404, 'KHONG_TIM_THAY'],
      [409, 'HE_THONG_CHUA_CAU_HINH'],
      [400, 'BO_LOC_KHONG_HOP_LE'],
    ] as const) {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ maLoi, thongBao: 'x' }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const error = await httpChatbotApi
        .suggest({ chuyenKhoaId: '3' }, new AbortController().signal)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).maLoi).toBe(maLoi);
    }
  });

  it('F2-05 hạn chờ là LONG_TIMEOUT_MS (45 giây): trước hạn còn chờ, đúng hạn thì TimeoutError', async () => {
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
      .suggest({ chuyenKhoaId: '3' }, new AbortController().signal)
      .then(
        () => 'xong',
        (error: unknown) => error,
      )
      .finally(settled);

    await vi.advanceTimersByTimeAsync(LONG_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toBeInstanceOf(TimeoutError);
  });
});

describe('httpChatbotApi.listSpecialties', () => {
  it('F2-06 GET /api/public/specialties?pageSize=100, KHÔNG Authorization, trả chỉ id và tên', async () => {
    fetchMock.mockResolvedValue(
      ok({
        items: [
          { chuyenKhoaId: '1', ten: 'Tim mạch', moTa: null, soBacSi: 3 },
          { chuyenKhoaId: '3', ten: 'Nội tổng quát', moTa: 'x', soBacSi: 5 },
        ],
        total: 2,
        page: 1,
        pageSize: 100,
      }),
    );

    const result = await httpChatbotApi.listSpecialties(
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = lastCall();
    expect(call.url).toBe('/api/public/specialties?pageSize=100');
    expect(call.init.method).toBe('GET');
    expect(call.headers.get('authorization')).toBeNull();
    expect(result).toEqual([
      { chuyenKhoaId: '1', ten: 'Tim mạch' },
      { chuyenKhoaId: '3', ten: 'Nội tổng quát' },
    ]);
  });

  it('F2-06 thân sai hình dạng thì ném UnexpectedResponseError', async () => {
    fetchMock.mockResolvedValue(ok({ danhSach: [] }));
    await expect(
      httpChatbotApi.listSpecialties(new AbortController().signal),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });
});
