import { ApiError, NetworkError } from '../../shared/api/errors';
import { request } from '../../shared/api/client';
import { RequestAbortedError, TimeoutError } from '../../shared/api/errors';
import {
  apiError,
  createFakeAuthApi,
  createFakeLocks,
} from '../../test/fake-auth-api';
import {
  login,
  logout,
  resetAuthForTest,
  restoreSession,
  retrySession,
} from './auth-session';
import { getAccessToken, getAuthState, setAccessToken } from './auth-store';
import { AUTH_LOCK_NAME, LOCK_WAIT_TIMEOUT_MS } from './refresh-lock';

// Task F1. Mã ca AU-nn là [đề xuất]; ca nào phủ test case của PLAN thì ghi kèm mã đó.
let api: ReturnType<typeof createFakeAuthApi>;
let locks: ReturnType<typeof createFakeLocks>;

function stubLocks(value: unknown) {
  Object.defineProperty(navigator, 'locks', { configurable: true, value });
}

// Đặt store vào trạng thái đã đăng nhập, token đang giữ là `tok-…`
async function signIn() {
  await login('a@example.invalid', 'mat-khau');
  api.requests.length = 0;
  api.refreshCalls = 0;
  api.meCalls = 0;
}

function authorizationsOf(path: string) {
  return api.requests
    .filter((r) => r.path === path)
    .map((r) => r.headers.get('Authorization'));
}

beforeEach(() => {
  resetAuthForTest();
  api = createFakeAuthApi();
  locks = createFakeLocks();
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  stubLocks(locks);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('khởi động và tải lại trang', () => {
  it('AU-01 làm mới rồi gọi /auth/me, hai request nối tiếp, thành authenticated', async () => {
    api.startSession();
    await restoreSession();
    expect(api.requests.map((r) => r.path)).toEqual([
      '/auth/refresh',
      '/auth/me',
    ]);
    expect(getAuthState()).toMatchObject({
      status: 'authenticated',
      user: { vaiTro: 'BenhNhan', hoTen: 'Bệnh nhân mẫu' },
    });
  });

  it('AU-02 (DN-32) gọi nhiều lần cùng lúc chỉ một POST /auth/refresh', async () => {
    api.startSession();
    await Promise.all([restoreSession(), restoreSession(), restoreSession()]);
    expect(api.refreshCalls).toBe(1);
    expect(api.meCalls).toBe(1);
  });

  it('AU-03 gọi lại sau khi đã xong không làm mới thêm', async () => {
    api.startSession();
    await restoreSession();
    await restoreSession();
    expect(api.refreshCalls).toBe(1);
    expect(api.meCalls).toBe(1);
  });

  it('AU-04 401 CHUA_DANG_NHAP lần mở đầu: im lặng, chưa đăng nhập', async () => {
    await restoreSession();
    expect(getAuthState()).toMatchObject({
      status: 'unauthenticated',
      user: null,
      sessionEnded: false,
    });
    expect(api.meCalls).toBe(0);
  });

  it('AU-05 401 PHIEN_HET_HIEU_LUC: chưa đăng nhập và có cờ sessionEnded', async () => {
    api.failNext('/auth/refresh', () => apiError(401, 'PHIEN_HET_HIEU_LUC'));
    await restoreSession();
    expect(getAuthState()).toMatchObject({
      status: 'unauthenticated',
      sessionEnded: true,
    });
  });

  it('AU-06 403 ORIGIN_KHONG_HOP_LE: lỗi không thử lại được, không tự gửi lại', async () => {
    api.failNext('/auth/refresh', () => apiError(403, 'ORIGIN_KHONG_HOP_LE'));
    await restoreSession();
    expect(getAuthState()).toMatchObject({ status: 'error', canRetry: false });
    expect(api.refreshCalls).toBe(1);
  });

  it.each([
    ['mất mạng', () => Promise.reject(new TypeError('x'))],
    ['5xx JSON', () => apiError(500, 'LOI_HE_THONG')],
    ['502 HTML', () => new Response('<html>', { status: 502 })],
  ])(
    'AU-07 %s: trạng thái lỗi có Thử lại, không coi là đăng xuất, không tự thử lại',
    async (_name, respond) => {
      api.failNext('/auth/refresh', respond);
      await restoreSession();
      expect(getAuthState()).toMatchObject({ status: 'error', canRetry: true });
      expect(api.refreshCalls).toBe(1);
    },
  );

  it('AU-08 timeout khi làm mới: trạng thái lỗi, không tự thử lại', async () => {
    vi.useFakeTimers();
    api.startSession();
    vi.mocked(fetch).mockImplementationOnce((_url, init) => api.hang(init));
    const done = restoreSession();
    await vi.advanceTimersByTimeAsync(15_000);
    await done;
    expect(getAuthState()).toMatchObject({ status: 'error', canRetry: true });
    expect(getAuthState().error).toBeInstanceOf(TimeoutError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('AU-09 Thử lại sau lỗi làm mới chạy lại đủ hai bước', async () => {
    api.startSession();
    api.failNext('/auth/refresh', () => Promise.reject(new TypeError('x')));
    await restoreSession();
    await retrySession();
    expect(getAuthState().status).toBe('authenticated');
    expect(api.refreshCalls).toBe(2);
  });

  it('AU-10 lỗi ở /auth/me thì Thử lại chỉ gọi /auth/me, không xoay token thêm', async () => {
    api.startSession();
    api.failNext('/auth/me', () => Promise.reject(new TypeError('x')));
    await restoreSession();
    expect(getAuthState().status).toBe('error');

    await retrySession();
    expect(getAuthState().status).toBe('authenticated');
    expect(api.refreshCalls).toBe(1);
  });

  it('AU-11 kết quả khởi động về muộn không ghi đè login vừa xong', async () => {
    let release = () => {};
    api.refreshGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    api.cookie = 1;
    const boot = restoreSession();
    await vi.waitFor(() => expect(api.inFlightRefresh).toBe(1));

    await login('a@example.invalid', 'mat-khau');
    // Cookie đổi nên làm mới của lần khởi động thất bại: lỗi về muộn này không được đăng xuất phiên mới
    api.cookie = 7;
    release();
    await boot;

    expect(getAuthState().status).toBe('authenticated');
  });

  it('AU-15 token của lần làm mới về muộn không ghi đè token của login', async () => {
    let release = () => {};
    api.refreshGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    api.cookie = 1;
    const boot = restoreSession();
    await vi.waitFor(() => expect(api.inFlightRefresh).toBe(1));

    await login('a@example.invalid', 'mat-khau');
    const loginToken = getAccessToken();
    release();
    await boot;

    expect(getAccessToken()).toBe(loginToken);
  });
});

describe('token chỉ trong bộ nhớ', () => {
  it('AU-12 đăng nhập, làm mới, đăng xuất đều không chạm storage và cookie', async () => {
    const setLocal = vi.spyOn(Storage.prototype, 'setItem');
    const cookieSetter = vi.fn();
    const descriptor = Object.getOwnPropertyDescriptor(
      Document.prototype,
      'cookie',
    );
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '',
      set: cookieSetter,
    });

    await signIn();
    api.expireTokens();
    await request('/benh-nhan/x');
    await logout();

    expect(setLocal).not.toHaveBeenCalled();
    expect(cookieSetter).not.toHaveBeenCalled();
    delete (document as unknown as Record<string, unknown>).cookie;
    if (descriptor)
      Object.defineProperty(Document.prototype, 'cookie', descriptor);
    vi.restoreAllMocks();
  });

  it('AU-13 token không nằm trong trạng thái đọc được từ useAuth', async () => {
    await signIn();
    expect(JSON.stringify(getAuthState())).not.toContain('tok-');
  });

  it('AU-14 getAccessToken của hook gắn Bearer vào request thường', async () => {
    await signIn();
    await request('/x');
    expect(authorizationsOf('/x')).toEqual([`Bearer ${getAccessToken()}`]);
  });
});

describe('tự làm mới khi 401', () => {
  it('AU-20 TOKEN_KHONG_HOP_LE: làm mới một lần rồi thử lại bằng token mới', async () => {
    await signIn();
    const oldToken = getAccessToken();
    api.expireTokens();

    await expect(request('/x')).resolves.toEqual({ ok: true });

    expect(api.refreshCalls).toBe(1);
    expect(authorizationsOf('/x')).toEqual([
      `Bearer ${oldToken}`,
      `Bearer ${getAccessToken()}`,
    ]);
    expect(getAccessToken()).not.toBe(oldToken);
  });

  it('AU-21 không gọi lại /auth/me sau lần làm mới ngầm', async () => {
    await signIn();
    api.expireTokens();
    await request('/x');
    expect(api.meCalls).toBe(0);
  });

  it('AU-22 PHIEN_HET_HIEU_LUC: xoá trạng thái, không làm mới, không thử lại', async () => {
    await signIn();
    api.revoked = true;

    await expect(request('/x')).rejects.toMatchObject({
      maLoi: 'PHIEN_HET_HIEU_LUC',
    });

    expect(api.refreshCalls).toBe(0);
    expect(authorizationsOf('/x')).toHaveLength(1);
    expect(getAccessToken()).toBeNull();
    expect(getAuthState()).toMatchObject({
      status: 'unauthenticated',
      user: null,
      sessionEnded: true,
    });
  });

  it('AU-23 CHUA_DANG_NHAP: làm mới trước rồi thử lại', async () => {
    api.startSession();
    await expect(request('/x')).resolves.toEqual({ ok: true });
    expect(api.refreshCalls).toBe(1);
  });

  it('AU-24 mã 401 khác thì không làm mới', async () => {
    await signIn();
    api.failNext('/x', () => apiError(401, 'MA_KHAC'));
    await expect(request('/x')).rejects.toBeInstanceOf(ApiError);
    expect(api.refreshCalls).toBe(0);
  });

  it.each([
    ['/auth/login'],
    ['auth/login'],
    ['/auth/login?x=1'],
    ['auth/refresh'],
    ['/auth/refresh/'],
    ['/auth/refresh?a=1#b'],
    ['//auth/logout'],
    ['auth/logout?x=1'],
  ])('AU-25 đường loại trừ %s không kích hoạt làm mới', async (path) => {
    await signIn();
    api.failNext(path.replace(/^\/*/, '/').split('?')[0], () =>
      apiError(401, 'TOKEN_KHONG_HOP_LE'),
    );
    await expect(request(path, { method: 'POST' })).rejects.toBeInstanceOf(
      ApiError,
    );
    // Chỉ có đúng request vừa gọi: không có POST /auth/refresh nào được sinh thêm
    expect(api.requests).toHaveLength(1);
    expect(getAuthState().status).toBe('authenticated');
  });

  it('AU-26 đường bắt đầu giống đường loại trừ vẫn được làm mới', async () => {
    await signIn();
    api.expireTokens();
    await expect(request('/auth/login-history')).resolves.toEqual({ ok: true });
    expect(api.refreshCalls).toBe(1);
  });

  it('AU-27 401 của /auth/login không làm mới, không đổi trạng thái', async () => {
    api.failNext('/auth/login', () => apiError(401, 'DANG_NHAP_SAI'));
    await expect(login('a@example.invalid', 'sai')).rejects.toMatchObject({
      maLoi: 'DANG_NHAP_SAI',
    });
    expect(api.refreshCalls).toBe(0);
  });

  it('AU-28 (DN-32) N request 401 cùng lúc trong một tab: đúng một POST refresh', async () => {
    await signIn();
    api.expireTokens();
    let release = () => {};
    api.refreshGate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const calls = [request('/a'), request('/b'), request('/c'), request('/d')];
    await vi.waitFor(() => expect(api.refreshCalls).toBe(1));
    release();
    await expect(Promise.all(calls)).resolves.toHaveLength(4);

    expect(api.refreshCalls).toBe(1);
    expect(api.revoked).toBe(false);
  });

  it('AU-29 401 về trễ sau khi làm mới xong: trả true ngay, không gửi thêm POST', async () => {
    await signIn();
    const oldToken = getAccessToken();
    api.expireTokens();
    await request('/a');
    expect(api.refreshCalls).toBe(1);
    expect(getAccessToken()).not.toBe(oldToken);

    // Một request mang token cũ nhận 401 sau đó
    setAccessToken(oldToken);
    const late = request('/late');
    setAccessToken(api.issueToken());
    await expect(late).resolves.toEqual({ ok: true });
    expect(api.refreshCalls).toBe(1);
  });

  it('AU-30 401 về trễ của phiên cũ không đăng xuất phiên mới', async () => {
    await signIn();
    const oldToken = getAccessToken();
    api.failNext('/late', () => apiError(401, 'PHIEN_HET_HIEU_LUC'));
    setAccessToken(oldToken);
    const late = request('/late');
    setAccessToken(api.issueToken());
    await expect(late).resolves.toEqual({ ok: true });
    expect(getAuthState().status).toBe('authenticated');
  });

  it('AU-31 (DN-32) nhiều tab: làm mới nối tiếp, cookie mới, không bị thu hồi', async () => {
    api.startSession();
    const tabs = [];
    for (let i = 0; i < 4; i += 1) {
      vi.resetModules();
      tabs.push(await import('./auth-session'));
    }

    await Promise.all(tabs.map((tab) => tab.restoreSession()));

    expect(api.refreshCalls).toBe(4);
    expect(api.maxInFlightRefresh).toBe(1);
    expect(api.revoked).toBe(false);
    expect(locks.names.every((name) => name === AUTH_LOCK_NAME)).toBe(true);
  });

  it('AU-32 đối chứng DN-32: không có khoá thì nhiều tab làm phiên bị thu hồi', async () => {
    stubLocks(undefined);
    api.startSession();
    const tabs = [];
    for (let i = 0; i < 2; i += 1) {
      vi.resetModules();
      tabs.push(await import('./auth-session'));
    }
    await Promise.all(tabs.map((tab) => tab.restoreSession()));
    expect(api.revoked).toBe(true);
  });

  it('AU-33 (DX-09) làm mới thất bại giữa phiên: xoá trạng thái, về đăng nhập', async () => {
    await signIn();
    api.expireTokens();
    api.failNext('/auth/refresh', () => apiError(401, 'PHIEN_HET_HIEU_LUC'));

    await expect(request('/x')).rejects.toBeInstanceOf(ApiError);

    expect(getAccessToken()).toBeNull();
    expect(getAuthState()).toMatchObject({
      status: 'unauthenticated',
      user: null,
      sessionEnded: true,
    });
  });

  it('AU-34 (DX-09) cookie hết hạn giữa phiên (401 CHUA_DANG_NHAP) cũng báo phiên kết thúc', async () => {
    await signIn();
    api.expireTokens();
    api.cookie = null;
    await expect(request('/x')).rejects.toBeInstanceOf(ApiError);
    expect(getAuthState()).toMatchObject({
      status: 'unauthenticated',
      sessionEnded: true,
    });
  });

  it.each([
    ['mất mạng', () => Promise.reject(new TypeError('x'))],
    ['5xx JSON', () => apiError(500, 'LOI_HE_THONG')],
    ['403', () => apiError(403, 'ORIGIN_KHONG_HOP_LE')],
  ])(
    'AU-35 làm mới lỗi %s giữa phiên: giữ người dùng, không tự thử lại',
    async (_name, respond) => {
      await signIn();
      const token = getAccessToken();
      api.expireTokens();
      api.failNext('/auth/refresh', respond);

      await expect(request('/x')).rejects.toBeInstanceOf(ApiError);

      expect(api.refreshCalls).toBe(1);
      expect(getAuthState().status).toBe('authenticated');
      expect(getAccessToken()).toBe(token);
    },
  );

  it('AU-36 làm mới timeout giữa phiên: giữ người dùng, không tự thử lại', async () => {
    await signIn();
    api.expireTokens();
    api.failNext('/x', () => apiError(401, 'TOKEN_KHONG_HOP_LE'));
    vi.useFakeTimers();
    const realFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((url, init) =>
      String(url).endsWith('/auth/refresh')
        ? (api.refreshCalls++, api.hang(init))
        : realFetch(url, init),
    );

    const outcome = request('/x').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(15_000);

    expect(await outcome).toBeInstanceOf(ApiError);
    expect(api.refreshCalls).toBe(1);
    expect(getAuthState().status).toBe('authenticated');
  });

  it('AU-37 hết hạn chờ khoá: hook trả false, giữ người dùng, nhả hàng đợi', async () => {
    await signIn();
    api.expireTokens();
    vi.useFakeTimers();
    let releaseHolder = () => {};
    const holder = locks.request(
      AUTH_LOCK_NAME,
      {},
      () => new Promise<void>((resolve) => (releaseHolder = resolve)),
    );

    const outcome = request('/x').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(LOCK_WAIT_TIMEOUT_MS);

    expect(await outcome).toBeInstanceOf(ApiError);
    expect(api.refreshCalls).toBe(0);
    expect(getAuthState().status).toBe('authenticated');
    releaseHolder();
    await holder;
  });

  it('AU-38 không có navigator.locks: vẫn làm mới và single-flight trong tab', async () => {
    stubLocks(undefined);
    await signIn();
    api.expireTokens();
    await Promise.all([request('/a'), request('/b')]);
    expect(api.refreshCalls).toBe(1);
    expect(api.revoked).toBe(false);
  });

  it('AU-39 /auth/me không chạy trong khoá', async () => {
    api.startSession();
    let locksHeldDuringMe = -1;
    let holding = 0;
    const realRequest = locks.request.bind(locks);
    locks.request = ((name, options, callback) =>
      realRequest(name, options, async () => {
        holding += 1;
        try {
          return await callback();
        } finally {
          holding -= 1;
        }
      })) as typeof locks.request;
    const realFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((url, init) => {
      if (String(url).endsWith('/auth/me')) {
        locksHeldDuringMe = Math.max(locksHeldDuringMe, holding);
      }
      return realFetch(url, init);
    });

    await restoreSession();

    expect(locksHeldDuringMe).toBe(0);
  });
});

describe('login', () => {
  it('AU-40 đăng nhập gọi /auth/me, vaiTro lấy từ /auth/me', async () => {
    api = createFakeAuthApi({
      vaiTro: 'BacSi',
      hoTen: 'Bác sĩ mẫu',
      daXacMinhEmail: true,
    });
    vi.stubGlobal('fetch', vi.fn(api.fetch));
    api.failNext('/auth/login', () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ accessToken: api.issueToken(), vaiTro: 'LeTan' }),
          { status: 200 },
        ),
      ),
    );

    await login('a@example.invalid', 'mat-khau');

    expect(getAuthState()).toMatchObject({
      status: 'authenticated',
      user: { vaiTro: 'BacSi', hoTen: 'Bác sĩ mẫu' },
    });
  });

  it('AU-41 lỗi đăng nhập trả nguyên ApiError, không đổi trạng thái, không token', async () => {
    await restoreSession();
    api.failNext('/auth/login', () => apiError(429, 'TAI_KHOAN_BI_KHOA_TAM'));
    await expect(login('a@example.invalid', 'x')).rejects.toMatchObject({
      status: 429,
      maLoi: 'TAI_KHOAN_BI_KHOA_TAM',
    });
    expect(getAccessToken()).toBeNull();
    expect(getAuthState().status).toBe('unauthenticated');
  });

  it('AU-42 /auth/me lỗi sau đăng nhập: ném lỗi, giữ token, retrySession chỉ gọi /auth/me', async () => {
    api.failNext('/auth/me', () => Promise.reject(new TypeError('x')));
    await expect(login('a@example.invalid', 'x')).rejects.toBeInstanceOf(
      NetworkError,
    );
    expect(getAuthState()).toMatchObject({ status: 'error', canRetry: true });
    expect(getAccessToken()).not.toBeNull();

    await retrySession();
    expect(getAuthState().status).toBe('authenticated');
    expect(api.refreshCalls).toBe(0);
  });

  it('AU-43 login, refresh, logout không gửi Authorization', async () => {
    await signIn();
    api.expireTokens();
    await request('/x');
    await logout();
    await login('a@example.invalid', 'x');
    for (const path of ['/auth/refresh', '/auth/logout', '/auth/login']) {
      expect(authorizationsOf(path).length).toBeGreaterThan(0);
      expect(authorizationsOf(path).every((value) => value === null)).toBe(
        true,
      );
    }
  });

  it('AU-44 đăng nhập thành công xoá cờ sessionEnded', async () => {
    api.failNext('/auth/refresh', () => apiError(401, 'PHIEN_HET_HIEU_LUC'));
    await restoreSession();
    expect(getAuthState().sessionEnded).toBe(true);

    await login('a@example.invalid', 'x');
    expect(getAuthState().sessionEnded).toBe(false);
  });
});

describe('logout', () => {
  it('AU-50 (DX-08) 204: xoá token và trạng thái, không có cờ phiên kết thúc', async () => {
    await signIn();
    await logout();
    expect(getAccessToken()).toBeNull();
    expect(getAuthState()).toMatchObject({
      status: 'unauthenticated',
      user: null,
      sessionEnded: false,
    });
  });

  it('AU-51 đăng xuất chủ động xoá cờ sessionEnded còn sót', async () => {
    await signIn();
    api.revoked = true;
    await request('/x').catch(() => undefined);
    expect(getAuthState().sessionEnded).toBe(true);
    await logout();
    expect(getAuthState().sessionEnded).toBe(false);
  });

  it.each([
    ['403', () => apiError(403, 'ORIGIN_KHONG_HOP_LE')],
    ['500', () => apiError(500, 'LOI_HE_THONG')],
    ['mất mạng', () => Promise.reject(new TypeError('x'))],
    ['502 HTML', () => new Response('<html>', { status: 502 })],
  ])('AU-52 lỗi %s: ném lỗi, giữ nguyên đăng nhập', async (_name, respond) => {
    await signIn();
    const token = getAccessToken();
    api.failNext('/auth/logout', respond);

    await expect(logout()).rejects.toBeDefined();

    expect(getAccessToken()).toBe(token);
    expect(getAuthState().status).toBe('authenticated');
  });

  it('AU-53 timeout: ném lỗi, giữ nguyên đăng nhập', async () => {
    await signIn();
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementationOnce((_url, init) => api.hang(init));
    const outcome = logout().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await outcome).toBeInstanceOf(TimeoutError);
    expect(getAuthState().status).toBe('authenticated');
  });

  it('AU-54 huỷ request đang bay sau khi nhận 204', async () => {
    await signIn();
    const realFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((url, init) =>
      String(url).endsWith('/cham') ? api.hang(init) : realFetch(url, init),
    );
    const flying = request('/cham').catch((e: unknown) => e);

    await logout();

    expect(await flying).toBeInstanceOf(RequestAbortedError);
  });

  it('AU-55 đăng xuất lỗi thì KHÔNG huỷ request đang bay', async () => {
    await signIn();
    const realFetch = vi.mocked(fetch).getMockImplementation()!;
    let flyingSignal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation((url, init) => {
      if (String(url).endsWith('/cham')) {
        flyingSignal = init?.signal ?? undefined;
        return api.hang(init);
      }
      return realFetch(url, init);
    });
    const flying = request('/cham').catch((e: unknown) => e);
    await vi.waitFor(() => expect(flyingSignal).toBeDefined());
    api.failNext('/auth/logout', () => apiError(500, 'LOI_HE_THONG'));

    await logout().catch(() => undefined);

    expect(flyingSignal!.aborted).toBe(false);
    await login('a@example.invalid', 'x');
    await logout();
    await flying;
  });

  it('AU-56 request sau đăng xuất không bị huỷ bởi tín hiệu cũ', async () => {
    await signIn();
    await logout();
    await login('a@example.invalid', 'x');
    await expect(request('/x')).resolves.toEqual({ ok: true });
  });

  it('AU-57 bỏ làm mới đang chờ khoá khi bấm đăng xuất', async () => {
    await signIn();
    api.expireTokens();
    let releaseHolder = () => {};
    const holder = locks.request(
      AUTH_LOCK_NAME,
      {},
      () => new Promise<void>((resolve) => (releaseHolder = resolve)),
    );
    const waiting = request('/x').catch((e: unknown) => e);
    await vi.waitFor(() => expect(locks.requests).toBeGreaterThan(1));

    const out = logout();
    releaseHolder();
    await holder;
    await out;
    await waiting;

    expect(api.refreshCalls).toBe(0);
    expect(api.logoutCalls).toBe(1);
  });

  it('AU-58 logout chạy dưới khoá, sau làm mới đang bay, không huỷ làm mới đó', async () => {
    await signIn();
    api.expireTokens();
    let release = () => {};
    api.refreshGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const flying = request('/x').catch((e: unknown) => e);
    await vi.waitFor(() => expect(api.inFlightRefresh).toBe(1));

    const out = logout();
    await Promise.resolve();
    expect(api.logoutCalls).toBe(0);

    release();
    await out;
    await flying;
    expect(api.logoutCalls).toBe(1);
    expect(getAccessToken()).toBeNull();
    expect(api.refreshCalls).toBe(1);
  });

  it('AU-59 bấm đúp đăng xuất chỉ gửi một POST', async () => {
    await signIn();
    await Promise.all([logout(), logout()]);
    expect(api.logoutCalls).toBe(1);
  });
});
