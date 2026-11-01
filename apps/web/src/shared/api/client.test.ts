import { setApiAuthHooks, type ApiAuthHooks } from './auth-hooks';
import { DEFAULT_TIMEOUT_MS, LONG_TIMEOUT_MS, request } from './client';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from './errors';

// Task P6. Mã ca WS-nn là [đề xuất] (issue #18 không có test case riêng).
const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function htmlResponse(status: number): Response {
  return new Response('<html><body>Bad Gateway</body></html>', {
    status,
    headers: { 'Content-Type': 'text/html' },
  });
}

// Giả lập mạng treo: chỉ kết thúc khi tín hiệu huỷ của CHÍNH request bị kích hoạt, nên test timeout chứng minh được abort thật sự xảy ra
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

function hooksStub(overrides: Partial<ApiAuthHooks> = {}) {
  return {
    getAccessToken: vi.fn<ApiAuthHooks['getAccessToken']>(() => null),
    recoverFromUnauthorized: vi.fn<ApiAuthHooks['recoverFromUnauthorized']>(
      async () => true,
    ),
    ...overrides,
  };
}

const UNAUTHORIZED = { maLoi: 'TOKEN_KHONG_HOP_LE', thongBao: 'x' };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  setApiAuthHooks(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('request: thành công', () => {
  it('WS-01 trả JSON của 200', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 'ok' }));
    await expect(request('/health')).resolves.toEqual({ status: 'ok' });
  });

  it('WS-02 204 không có thân trả undefined', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(request('/auth/logout')).resolves.toBeUndefined();
  });

  it('WS-03 200 thân rỗng trả undefined', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    await expect(request('/x')).resolves.toBeUndefined();
  });
});

describe('request: lỗi API', () => {
  it('WS-04 4xx JSON P5 giữ đủ status, maLoi, thongBao, chiTiet', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, {
        maLoi: 'TAI_KHOAN_BI_KHOA_TAM',
        thongBao: 'Đang khoá',
        chiTiet: { soGiayConLai: 60 },
      }),
    );
    const error = await request('/auth/login').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 429,
      maLoi: 'TAI_KHOAN_BI_KHOA_TAM',
      thongBao: 'Đang khoá',
      chiTiet: { soGiayConLai: 60 },
    });
  });

  it('WS-05 400 kèm loi giữ chi tiết từng trường', async () => {
    const loi = [{ truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' }];
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        thongBao: 'Dữ liệu không hợp lệ.',
        loi,
      }),
    );
    await expect(request('/x')).rejects.toMatchObject({
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      loi,
    });
  });

  it('WS-06 5xx JSON LOI_HE_THONG là ApiError kèm requestId', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(500, {
        maLoi: 'LOI_HE_THONG',
        thongBao: 'Hệ thống đang gặp sự cố.',
        requestId: 'r-1',
      }),
    );
    const error = await request('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 500,
      maLoi: 'LOI_HE_THONG',
      requestId: 'r-1',
    });
  });

  it('WS-07 503 JSON GUI_MAIL_LOI là ApiError, không phải lỗi mạng', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(503, { maLoi: 'GUI_MAIL_LOI', thongBao: 'x' }),
    );
    const error = await request('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('request: phản hồi không chuẩn', () => {
  it('WS-08 502 thân HTML thành UnexpectedResponseError, không rò HTML', async () => {
    fetchMock.mockResolvedValue(htmlResponse(502));
    const error = await request('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnexpectedResponseError);
    expect(error).toMatchObject({ status: 502 });
    expect(String((error as Error).message)).not.toContain('<html');
  });

  it('WS-09 lỗi thân rỗng thành UnexpectedResponseError', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 504 }));
    await expect(request('/x')).rejects.toBeInstanceOf(UnexpectedResponseError);
  });

  it('WS-10 200 thân HTML (rơi vào fallback SPA) không được coi là JSON', async () => {
    fetchMock.mockResolvedValue(
      new Response('<!doctype html>', { status: 200 }),
    );
    await expect(request('/x')).rejects.toBeInstanceOf(UnexpectedResponseError);
  });

  it('WS-11 JSON lỗi thiếu maLoi hoặc thongBao không phải ApiError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { thongBao: 'x' }));
    await expect(request('/x')).rejects.toBeInstanceOf(UnexpectedResponseError);
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { maLoi: 'X' }));
    await expect(request('/x')).rejects.toBeInstanceOf(UnexpectedResponseError);
  });
});

describe('request: mất mạng, timeout, huỷ', () => {
  it('WS-12 fetch bị từ chối thành NetworkError, không phải ApiError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await request('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error).not.toBeInstanceOf(ApiError);
  });

  it('WS-13 hết 15 giây mặc định thì huỷ thật request và ném TimeoutError', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(hangUntilAborted);
    const outcome = request('/x').catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS - 1);
    expect(lastCall().init.signal!.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(lastCall().init.signal!.aborted).toBe(true);
    expect(await outcome).toBeInstanceOf(TimeoutError);
  });

  it('WS-14 timeoutMs ghi đè theo từng lời gọi; hằng dài là 45 giây', async () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(15_000);
    expect(LONG_TIMEOUT_MS).toBe(45_000);
    vi.useFakeTimers();
    fetchMock.mockImplementation(hangUntilAborted);
    const outcome = request('/x', { timeoutMs: LONG_TIMEOUT_MS }).catch(
      (e: unknown) => e,
    );

    await vi.advanceTimersByTimeAsync(LONG_TIMEOUT_MS - 1);
    expect(lastCall().init.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toBeInstanceOf(TimeoutError);
  });

  it('WS-15 timeout vẫn áp dụng khi đọc thân phản hồi bị treo', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, init) =>
      Promise.resolve({
        status: 200,
        text: () =>
          new Promise<string>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Đã huỷ', 'AbortError'));
            });
          }),
      } as Response),
    );
    const outcome = request('/x').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    expect(await outcome).toBeInstanceOf(TimeoutError);
  });

  it('WS-16 nơi gọi huỷ giữa chừng thì huỷ request và ném RequestAbortedError', async () => {
    fetchMock.mockImplementation(hangUntilAborted);
    const controller = new AbortController();
    const outcome = request('/x', { signal: controller.signal }).catch(
      (e: unknown) => e,
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    controller.abort();
    expect(await outcome).toBeInstanceOf(RequestAbortedError);
    expect(lastCall().init.signal!.aborted).toBe(true);
  });

  it('WS-17 tín hiệu đã huỷ từ trước thì không gửi request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      request('/x', { signal: controller.signal }),
    ).rejects.toBeInstanceOf(RequestAbortedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['thành công', () => fetchMock.mockResolvedValue(jsonResponse(200, {}))],
    [
      'lỗi API',
      () =>
        fetchMock.mockResolvedValue(
          jsonResponse(400, { maLoi: 'X', thongBao: 'x' }),
        ),
    ],
    ['mất mạng', () => fetchMock.mockRejectedValue(new TypeError('x'))],
  ])(
    'WS-18 dọn hẹn giờ và listener sau khi xong (%s)',
    async (_name, arrange) => {
      vi.useFakeTimers();
      arrange();
      const controller = new AbortController();
      const removeListener = vi.spyOn(controller.signal, 'removeEventListener');

      await request('/x', { signal: controller.signal }).catch(() => undefined);

      expect(vi.getTimerCount()).toBe(0);
      expect(removeListener).toHaveBeenCalledWith(
        'abort',
        expect.any(Function),
      );
    },
  );
});

describe('request: dựng yêu cầu', () => {
  it('WS-19 URL gốc mặc định /api khi biến rỗng, không thừa dấu /', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, {}));
    vi.stubEnv('VITE_API_URL', '');
    await request('/health');
    expect(lastCall().url).toBe('/api/health');

    vi.stubEnv('VITE_API_URL', '/api//');
    await request('health');
    expect(lastCall().url).toBe('/api/health');

    await request('//health');
    expect(lastCall().url).toBe('/api/health');
  });

  it('WS-20 mã hoá query, bỏ undefined và null, giữ 0 và false', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, {}));
    await request('/tim', {
      query: { q: 'a&b c', page: 0, on: false, bo: undefined, cung: null },
    });
    expect(lastCall().url).toBe('/api/tim?q=a%26b+c&page=0&on=false');

    await request('/tim', { query: { bo: undefined } });
    expect(lastCall().url).toBe('/api/tim');
  });

  it('WS-21 Content-Type JSON chỉ khi có thân; luôn credentials same-origin', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, {}));
    await request('/x');
    expect(lastCall().init.credentials).toBe('same-origin');
    expect(lastCall().headers.has('Content-Type')).toBe(false);
    expect(lastCall().headers.get('Accept')).toBe('application/json');
    expect(lastCall().init.method).toBe('GET');

    await request('/x', { method: 'POST', json: { a: 1 } });
    expect(lastCall().init.credentials).toBe('same-origin');
    expect(lastCall().headers.get('Content-Type')).toBe('application/json');
    expect(lastCall().init.body).toBe('{"a":1}');
  });

  it('WS-22 FormData do trình duyệt tự đặt Content-Type', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, {}));
    const form = new FormData();
    await request('/upload', { method: 'POST', body: form });
    expect(lastCall().init.body).toBe(form);
    expect(lastCall().headers.has('Content-Type')).toBe(false);
  });

  it('WS-23 không gắn Authorization khi chưa có hook hoặc chưa có token', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, {}));
    await request('/x');
    expect(lastCall().headers.has('Authorization')).toBe(false);

    setApiAuthHooks(hooksStub());
    await request('/x');
    expect(lastCall().headers.has('Authorization')).toBe(false);
  });

  it('WS-24 có token thì gắn Bearer', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, {}));
    setApiAuthHooks(hooksStub({ getAccessToken: () => 'tok-1' }));
    await request('/x');
    expect(lastCall().headers.get('Authorization')).toBe('Bearer tok-1');
  });
});

describe('điểm cắm setApiAuthHooks', () => {
  it('WS-30 không có hook thì 401 ném ApiError ngay', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, UNAUTHORIZED));
    await expect(request('/x')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WS-31 (khoản a) lần thử lại gọi lại getAccessToken và dùng token mới', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, UNAUTHORIZED))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const tokens = ['tok-cu', 'tok-moi'];
    const hooks = hooksStub({ getAccessToken: () => tokens.shift() ?? null });
    setApiAuthHooks(hooks);

    await expect(request('/x')).resolves.toEqual({ ok: true });

    const authorizations = fetchMock.mock.calls.map(([, init]) =>
      new Headers(init!.headers).get('Authorization'),
    );
    expect(authorizations).toEqual(['Bearer tok-cu', 'Bearer tok-moi']);
    expect(hooks.recoverFromUnauthorized).toHaveBeenCalledWith({
      path: '/x',
      error: expect.any(ApiError),
    });
  });

  it('WS-32 chỉ thử lại MỘT lần: 401 lần hai ném lỗi, không gọi hook nữa', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(401, UNAUTHORIZED));
    const hooks = hooksStub();
    setApiAuthHooks(hooks);

    await expect(request('/x')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(hooks.recoverFromUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('WS-33 (khoản b) không gọi hook với lỗi không phải 401', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, { maLoi: 'KHONG_DU_QUYEN', thongBao: 'x' }),
    );
    const hooks = hooksStub();
    setApiAuthHooks(hooks);
    await expect(request('/x')).rejects.toBeInstanceOf(ApiError);
    expect(hooks.recoverFromUnauthorized).not.toHaveBeenCalled();
  });

  it('WS-34 (khoản b) không gọi hook với 401 không phải JSON chuẩn', async () => {
    fetchMock.mockResolvedValue(htmlResponse(401));
    const hooks = hooksStub();
    setApiAuthHooks(hooks);
    await expect(request('/x')).rejects.toBeInstanceOf(UnexpectedResponseError);
    expect(hooks.recoverFromUnauthorized).not.toHaveBeenCalled();
  });

  it('WS-35 (khoản b) không gọi hook khi mất mạng', async () => {
    fetchMock.mockRejectedValue(new TypeError('x'));
    const hooks = hooksStub();
    setApiAuthHooks(hooks);
    await expect(request('/x')).rejects.toBeInstanceOf(NetworkError);
    expect(hooks.recoverFromUnauthorized).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WS-36 (khoản b) không gọi hook khi timeout', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(hangUntilAborted);
    const hooks = hooksStub();
    setApiAuthHooks(hooks);
    const outcome = request('/x').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    expect(await outcome).toBeInstanceOf(TimeoutError);
    expect(hooks.recoverFromUnauthorized).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WS-37 (khoản b) không gọi hook khi bị huỷ', async () => {
    fetchMock.mockImplementation(hangUntilAborted);
    const hooks = hooksStub();
    setApiAuthHooks(hooks);
    const controller = new AbortController();
    const outcome = request('/x', { signal: controller.signal }).catch(
      (e: unknown) => e,
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    controller.abort();
    expect(await outcome).toBeInstanceOf(RequestAbortedError);
    expect(hooks.recoverFromUnauthorized).not.toHaveBeenCalled();
  });

  it('WS-38 (khoản c) hook trả false thì ném ApiError gốc, không thử lại', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, UNAUTHORIZED));
    setApiAuthHooks(hooksStub({ recoverFromUnauthorized: async () => false }));
    await expect(request('/x')).rejects.toMatchObject({
      status: 401,
      maLoi: 'TOKEN_KHONG_HOP_LE',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WS-39 (khoản d) hook ném lỗi thì vẫn ném ApiError gốc, không thử lại', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(401, UNAUTHORIZED));
    setApiAuthHooks(
      hooksStub({
        recoverFromUnauthorized: () => {
          throw new Error('hỏng đồng bộ');
        },
      }),
    );
    await expect(request('/x')).rejects.toMatchObject({
      maLoi: 'TOKEN_KHONG_HOP_LE',
    });

    setApiAuthHooks(
      hooksStub({
        recoverFromUnauthorized: () => Promise.reject(new Error('hỏng')),
      }),
    );
    await expect(request('/x')).rejects.toMatchObject({
      maLoi: 'TOKEN_KHONG_HOP_LE',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('WS-40 (khoản e) nơi gọi huỷ khi đang chờ hook thì RequestAbortedError, không thử lại', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, UNAUTHORIZED));
    let finishRecovery: (value: boolean) => void = () => undefined;
    const hooks = hooksStub({
      recoverFromUnauthorized: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            finishRecovery = resolve;
          }),
      ),
    });
    setApiAuthHooks(hooks);
    const controller = new AbortController();
    const outcome = request('/x', { signal: controller.signal }).catch(
      (e: unknown) => e,
    );
    await vi.waitFor(() =>
      expect(hooks.recoverFromUnauthorized).toHaveBeenCalled(),
    );

    controller.abort();
    expect(await outcome).toBeInstanceOf(RequestAbortedError);

    finishRecovery(true);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WS-41 (khoản f) thân JSON và FormData gửi lại nguyên vẹn khi thử lại', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, {}));
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, UNAUTHORIZED))
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(jsonResponse(401, UNAUTHORIZED));
    setApiAuthHooks(hooksStub());

    await request('/x', { method: 'POST', json: { a: 1 } });
    expect(fetchMock.mock.calls[0][1]!.body).toBe('{"a":1}');
    expect(fetchMock.mock.calls[1][1]!.body).toBe('{"a":1}');

    const form = new FormData();
    await request('/up', { method: 'POST', body: form });
    expect(fetchMock.mock.calls[2][1]!.body).toBe(form);
    expect(fetchMock.mock.calls[3][1]!.body).toBe(form);
  });

  it('WS-42 (khoản g) setApiAuthHooks(null) gỡ hook', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(401, UNAUTHORIZED));
    const hooks = hooksStub({ getAccessToken: () => 'tok' });
    setApiAuthHooks(hooks);
    setApiAuthHooks(null);

    await expect(request('/x')).rejects.toBeInstanceOf(ApiError);
    expect(hooks.recoverFromUnauthorized).not.toHaveBeenCalled();
    expect(lastCall().headers.has('Authorization')).toBe(false);
  });

  it('WS-43 lần thử lại có hạn timeout mới, không dùng chung hẹn giờ lần đầu', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, UNAUTHORIZED))
      .mockImplementationOnce(hangUntilAborted);
    setApiAuthHooks(hooksStub());
    const outcome = request('/x').catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS - 1);
    expect(lastCall().init.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toBeInstanceOf(TimeoutError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
