import { setApiAuthHooks } from '../../shared/api/auth-hooks';
import { RequestAbortedError } from '../../shared/api/errors';
import {
  completeActivation,
  validateActivationLink,
} from './activation-service';
import { makeLink, randomBase64Url } from './testing/link-factory';

// Admin F10. Mã ca NSF10-nn là [đề xuất] (TRACKING admin 9A.7); ca nào phủ test case của PLAN thì ghi kèm mã đó.
const fetchMock = vi.fn<typeof fetch>();
const SESSION_ACCESS = `acc-${randomBase64Url(8)}`;
// Mật khẩu ngắn, sinh từ hai mảnh: không phải chuỗi bí mật thật
const NEW_PW = ['Moi', '@', '2468'].join('');

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
    body: JSON.parse(String(init!.body)) as Record<string, unknown>,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // Đang có phiên đăng nhập: nếu lời gọi quên `skipAuthToken` thì access token này sẽ bị gắn vào Authorization
  setApiAuthHooks({
    getAccessToken: () => SESSION_ACCESS,
    recoverFromUnauthorized: async () => false,
  });
});

afterEach(() => {
  setApiAuthHooks(null);
  vi.unstubAllGlobals();
});

describe('validateActivationLink', () => {
  it('NSF10-20 H6, SE-A13: POST đúng đường, thân đúng { id, token }, KHÔNG Authorization, URL không có query', async () => {
    fetchMock.mockResolvedValue(ok({ hopLe: true }));
    const link = makeLink();

    await validateActivationLink(link);

    const call = lastCall();
    expect(call.url).toBe('/api/staff-activation/validate');
    expect(call.init.method).toBe('POST');
    expect(call.init.credentials).toBe('same-origin');
    expect(call.headers.get('content-type')).toBe('application/json');
    expect(call.headers.get('authorization')).toBeNull();
    expect(call.body).toEqual({ id: link.id, token: link.token });
    expect(Object.keys(call.body).sort()).toEqual(['id', 'token']);
    expect(call.url).not.toContain('?');
    expect(call.url).not.toContain(link.token);
    // Token CHỈ ở thân: không ở header nào
    for (const [, value] of call.headers)
      expect(value).not.toContain(link.token);
  });

  it('NSF10-20 hợp đồng B16: lỗi API ném ApiError nguyên vẹn; huỷ bằng signal ⇒ RequestAbortedError', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ maLoi: 'LIEN_KET_KHONG_HOP_LE', thongBao: 'x' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await expect(validateActivationLink(makeLink())).rejects.toMatchObject({
      maLoi: 'LIEN_KET_KHONG_HOP_LE',
    });

    const controller = new AbortController();
    controller.abort();
    await expect(
      validateActivationLink(makeLink(), controller.signal),
    ).rejects.toBeInstanceOf(RequestAbortedError);
  });
});

describe('completeActivation', () => {
  it('NSF10-21 SE-A2: thân đúng bốn khoá { id, token, matKhauMoi, xacNhan }; xacNhan là chuỗi người dùng nhập', async () => {
    fetchMock.mockResolvedValue(ok({ daKichHoat: true }));
    const link = makeLink();
    const confirmation = `${NEW_PW}-khac`;

    await completeActivation(link, NEW_PW, confirmation);

    const call = lastCall();
    expect(call.url).toBe('/api/staff-activation/complete');
    expect(call.init.method).toBe('POST');
    expect(call.body).toEqual({
      id: link.id,
      token: link.token,
      matKhauMoi: NEW_PW,
      xacNhan: confirmation,
    });
    expect(Object.keys(call.body).sort()).toEqual([
      'id',
      'matKhauMoi',
      'token',
      'xacNhan',
    ]);
  });

  it('NSF10-21 H6: KHÔNG Authorization dù có phiên; token và mật khẩu không ở URL hay header', async () => {
    fetchMock.mockResolvedValue(ok({ daKichHoat: true }));
    const link = makeLink();

    await completeActivation(link, NEW_PW, NEW_PW);

    const call = lastCall();
    expect(call.headers.get('authorization')).toBeNull();
    expect(call.url).not.toContain('?');
    expect(call.url).not.toContain(link.token);
    expect(call.url).not.toContain(NEW_PW);
    for (const [, value] of call.headers) {
      expect(value).not.toContain(link.token);
      expect(value).not.toContain(NEW_PW);
    }
  });
});
