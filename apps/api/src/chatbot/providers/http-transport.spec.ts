import { FetchHttpTransport } from './http-transport.js';
import { ProviderError } from './provider-error.js';
import { ERROR_BODY_MARKER } from '../testing/fixture-reader.js';

// chatbot P1 — FetchHttpTransport (hỗ trợ HDA-12, HDA-13, HDA-15): `fetch` luôn là hàm giả, KHÔNG chạm mạng.
const REQUEST = {
  url: 'https://nha-cung-cap.example.test/v1/goi',
  headers: { 'Content-Type': 'application/json', 'x-mau': 'gia-tri-mau' },
  body: '{"a":1}',
};

function fakeFetch(respond: () => Promise<Response>) {
  const calls: { input: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push({ input: url, init: init ?? {} });
    return respond();
  };
  return { fetchImpl, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FetchHttpTransport (chatbot P1)', () => {
  it('2xx ⇒ trả mã và thân chữ; gửi POST, thân, header và signal đã cho', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      Promise.resolve(new Response('{"ok":true}', { status: 200 })),
    );
    const controller = new AbortController();

    const response = await new FetchHttpTransport(fetchImpl).post(
      REQUEST,
      controller.signal,
    );

    expect(response).toEqual({ status: 200, bodyText: '{"ok":true}' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe(REQUEST.url);
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.body).toBe(REQUEST.body);
    expect(calls[0]?.init.headers).toEqual(REQUEST.headers);
    expect(calls[0]?.init.signal).toBe(controller.signal);
  });

  it('cấm chuyển hướng (redirect: error) để header khoá không bị gửi sang địa chỉ khác', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      Promise.resolve(new Response('{}', { status: 200 })),
    );

    await new FetchHttpTransport(fetchImpl).post(
      REQUEST,
      new AbortController().signal,
    );

    expect(calls[0]?.init.redirect).toBe('error');
  });

  it.each([400, 401, 429, 500, 502])(
    'HTTP %i ⇒ trả mã và thân RỖNG: thân lỗi không bao giờ rời transport',
    async (status) => {
      const { fetchImpl } = fakeFetch(() =>
        Promise.resolve(new Response(ERROR_BODY_MARKER, { status })),
      );

      const response = await new FetchHttpTransport(fetchImpl).post(
        REQUEST,
        new AbortController().signal,
      );

      expect(response).toEqual({ status, bodyText: '' });
    },
  );

  it('signal bị huỷ ⇒ ProviderError timeout', async () => {
    const controller = new AbortController();
    const { fetchImpl } = fakeFetch(() => {
      controller.abort();
      return Promise.reject(new DOMException('đã huỷ', 'AbortError'));
    });

    await expect(
      new FetchHttpTransport(fetchImpl).post(REQUEST, controller.signal),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('lỗi tên TimeoutError hay AbortError dù signal chưa huỷ ⇒ timeout', async () => {
    for (const name of ['TimeoutError', 'AbortError']) {
      const { fetchImpl } = fakeFetch(() =>
        Promise.reject(Object.assign(new Error('hết giờ'), { name })),
      );
      await expect(
        new FetchHttpTransport(fetchImpl).post(
          REQUEST,
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ kind: 'timeout' });
    }
  });

  it('lỗi mạng (TypeError: fetch failed, chuyển hướng bị cấm…) ⇒ network; thông điệp gốc có địa chỉ bị bỏ', async () => {
    const original = new TypeError('fetch failed', {
      cause: new Error('getaddrinfo ENOTFOUND dia-chi-rieng.example.test'),
    });
    const { fetchImpl } = fakeFetch(() => Promise.reject(original));

    const error: unknown = await new FetchHttpTransport(fetchImpl)
      .post(REQUEST, new AbortController().signal)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ kind: 'network' });
    expect((error as Error).message).toBe('AI provider failure: network');
    expect((error as Error).cause).toBeUndefined();
  });

  it('mặc định dùng `fetch` toàn cục ĐỌC LÚC GỌI (test thay được fetch sau khi dựng transport)', async () => {
    const transport = new FetchHttpTransport();
    const stub = vi.fn(() =>
      Promise.resolve(new Response('{"toanCuc":1}', { status: 200 })),
    );
    vi.stubGlobal('fetch', stub);

    const response = await transport.post(
      REQUEST,
      new AbortController().signal,
    );

    expect(stub).toHaveBeenCalledTimes(1);
    expect(response.bodyText).toBe('{"toanCuc":1}');
  });
});
