import { request } from '../../../shared/api/client';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import {
  apiError,
  createFakeAuthApi,
  createFakeLocks,
} from '../../../test/fake-auth-api';
import {
  ChangePasswordNotSentError,
  changePassword,
  login,
  logout,
  resetAuthForTest,
} from '../auth-session';
import { getAccessToken, getAuthState } from '../auth-store';
import { AUTH_LOCK_NAME, LOCK_WAIT_TIMEOUT_MS } from '../refresh-lock';

// Task F5, `changePassword()` của auth-session (TRACKING auth F5-B). Mã ca CS-nn là [đề xuất]; ca phủ test case của PLAN ghi kèm mã đó.
const PATH = '/auth/change-password';
const INPUT = {
  matKhauCu: 'Cu@12345',
  matKhauMoi: ' Moi@12345 ',
  xacNhan: ' Moi@12345 ',
};

let api: ReturnType<typeof createFakeAuthApi>;
let locks: ReturnType<typeof createFakeLocks>;

function stubLocks(value: unknown) {
  Object.defineProperty(navigator, 'locks', { configurable: true, value });
}

async function signIn() {
  await login('a@example.invalid', 'mat-khau');
  api.requests.length = 0;
  api.bodies.length = 0;
  api.refreshCalls = 0;
  locks.names.length = 0;
  locks.requests = 0;
}

const changeRequests = () => api.requests.filter((r) => r.path === PATH);

// Giữ khoá như một tab khác đang làm mới; trả hàm nhả khoá
function holdLock() {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  void locks.request(AUTH_LOCK_NAME, {}, () => held);
  return release;
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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

describe('gửi đổi mật khẩu', () => {
  it('CS-01 DM-01 gửi đúng ba trường, POST, có Bearer; không trim', async () => {
    await signIn();
    const token = getAccessToken();
    await changePassword({ ...INPUT, taiKhoanId: '1' } as typeof INPUT);
    expect(changeRequests()).toHaveLength(1);
    expect(changeRequests()[0].method).toBe('POST');
    expect(changeRequests()[0].headers.get('Authorization')).toBe(
      `Bearer ${token}`,
    );
    expect(api.bodies).toEqual([{ path: PATH, body: INPUT }]);
  });

  it('CS-02 DM-07 thành công: vẫn đăng nhập, giữ access token, cookie đã xoay', async () => {
    await signIn();
    const token = getAccessToken();
    const cookie = api.cookie;
    await changePassword(INPUT);
    expect(getAuthState().status).toBe('authenticated');
    expect(getAccessToken()).toBe(token);
    expect(api.cookie).toBe((cookie ?? 0) + 1);
    expect(api.refreshCalls).toBe(0);
  });

  it('CS-03 chạy trong khoá refresh thật (withAuthLock): đứng sau tab đang giữ khoá', async () => {
    await signIn();
    const release = holdLock();
    const done = changePassword(INPUT);
    await flush();
    expect(changeRequests()).toHaveLength(0);
    release();
    await done;
    expect(changeRequests()).toHaveLength(1);
    expect(locks.names.every((name) => name === AUTH_LOCK_NAME)).toBe(true);
  });

  it('CS-04 TECH_DEBT 48 làm mới cùng cookie cũ đang bay: đổi mật khẩu chờ, phiên KHÔNG bị thu hồi', async () => {
    await signIn();
    api.expireTokens();
    let openGate!: () => void;
    api.refreshGate = new Promise((resolve) => {
      openGate = resolve;
    });
    const other = request('/x');
    await vi.waitFor(() => expect(api.refreshCalls).toBe(1));
    const done = changePassword(INPUT);
    await flush();
    expect(changeRequests()).toHaveLength(0);
    openGate();
    await Promise.all([other, done]);
    expect(api.revoked).toBe(false);
    expect(getAuthState().status).toBe('authenticated');
    // Đổi mật khẩu dùng token vừa làm mới
    expect(changeRequests()[0].headers.get('Authorization')).toBe(
      `Bearer ${getAccessToken()}`,
    );
  });

  it('CS-05 không có navigator.locks: vẫn gửi được', async () => {
    await signIn();
    stubLocks(undefined);
    await changePassword(INPUT);
    expect(changeRequests()).toHaveLength(1);
  });
});

describe('401 trong khoá', () => {
  it('CS-06 token hết hạn: làm mới NGOÀI khoá rồi gửi lại đúng một lần, không kẹt khoá', async () => {
    await signIn();
    const oldToken = getAccessToken();
    api.expireTokens();
    const outcome = await Promise.race([
      changePassword(INPUT).then(() => 'xong'),
      new Promise((resolve) => setTimeout(() => resolve('kẹt'), 2000)),
    ]);
    expect(outcome).toBe('xong');
    expect(api.refreshCalls).toBe(1);
    expect(changeRequests().map((r) => r.headers.get('Authorization'))).toEqual(
      [`Bearer ${oldToken}`, `Bearer ${getAccessToken()}`],
    );
    expect(api.revoked).toBe(false);
  });

  it('CS-07 401 lần hai: ném lỗi, không gửi lần ba', async () => {
    await signIn();
    api.expireTokens();
    api.failNext(PATH, () => apiError(401, 'TOKEN_KHONG_HOP_LE'));
    api.failNext(PATH, () => apiError(401, 'TOKEN_KHONG_HOP_LE'));
    await expect(changePassword(INPUT)).rejects.toMatchObject({ status: 401 });
    expect(changeRequests()).toHaveLength(2);
    expect(api.refreshCalls).toBe(1);
  });

  it('CS-08 DM-05 401 PHIEN_HET_HIEU_LUC: về đăng nhập, không làm mới, không gửi lại', async () => {
    await signIn();
    api.failNext(PATH, () => apiError(401, 'PHIEN_HET_HIEU_LUC'));
    await expect(changePassword(INPUT)).rejects.toBeInstanceOf(ApiError);
    expect(api.refreshCalls).toBe(0);
    expect(changeRequests()).toHaveLength(1);
    expect(getAuthState()).toMatchObject({
      status: 'unauthenticated',
      sessionEnded: true,
    });
  });

  it('CS-09 làm mới bị 401: xoá phiên, không gửi lại', async () => {
    await signIn();
    api.expireTokens();
    api.failNext('/auth/refresh', () => apiError(401, 'PHIEN_HET_HIEU_LUC'));
    await expect(changePassword(INPUT)).rejects.toMatchObject({ status: 401 });
    expect(changeRequests()).toHaveLength(1);
    expect(getAuthState().status).toBe('unauthenticated');
  });

  it('CS-10 làm mới mất mạng: ném 401 gốc, giữ người dùng, không gửi lại', async () => {
    await signIn();
    api.expireTokens();
    api.failNext('/auth/refresh', () => Promise.reject(new TypeError('net')));
    await expect(changePassword(INPUT)).rejects.toMatchObject({ status: 401 });
    expect(changeRequests()).toHaveLength(1);
    expect(getAuthState().status).toBe('authenticated');
  });

  it.each([
    ['/auth/change-password'],
    ['auth/change-password'],
    ['/auth/change-password/'],
    ['//auth/change-password'],
    ['/auth/change-password?x=1'],
    ['auth/change-password/?a=1#b'],
  ])(
    'CS-11 hook của client không làm mới cho %s (tránh vào lại khoá)',
    async (path) => {
      await signIn();
      api.expireTokens();
      await expect(
        request(path, { method: 'POST', json: INPUT }),
      ).rejects.toMatchObject({ status: 401, maLoi: 'TOKEN_KHONG_HOP_LE' });
      expect(api.refreshCalls).toBe(0);
    },
  );

  it('CS-12 đăng xuất trong lúc phục hồi: không gửi lại mật khẩu sau khi đã đăng xuất', async () => {
    await signIn();
    api.expireTokens();
    let openGate!: () => void;
    api.refreshGate = new Promise((resolve) => {
      openGate = resolve;
    });
    const done = changePassword(INPUT).catch((e: unknown) => e);
    await vi.waitFor(() => expect(api.refreshCalls).toBe(1));
    const out = logout();
    openGate();
    await out;
    expect(await done).toBeInstanceOf(RequestAbortedError);
    expect(changeRequests()).toHaveLength(1);
  });

  it('CS-18 bấm đăng xuất khi đổi mật khẩu còn chờ khoá: không gửi', async () => {
    await signIn();
    const release = holdLock();
    const done = changePassword(INPUT).catch((e: unknown) => e);
    const out = logout();
    release();
    await out;
    expect(await done).toBeInstanceOf(RequestAbortedError);
    expect(changeRequests()).toHaveLength(0);
  });
});

describe('phiên đổi trong lúc chờ khoá', () => {
  it('CS-19 đăng nhập lại (epoch đổi, không có đăng xuất đang chạy) khi còn chờ khoá: không gửi', async () => {
    await signIn();
    const release = holdLock();
    const done = changePassword(INPUT).catch((e: unknown) => e);
    await flush();
    // Đăng nhập không dùng khoá: phiên đổi chủ ngay, `logoutPromise` vẫn null
    await login('b@example.invalid', 'mat-khau');
    release();
    expect(await done).toBeInstanceOf(RequestAbortedError);
    expect(changeRequests()).toHaveLength(0);
  });

  it('CS-20 đăng xuất XONG khi còn chờ khoá (logoutPromise đã null): không gửi', async () => {
    await signIn();
    const release = holdLock();
    const done = changePassword(INPUT).catch((e: unknown) => e);
    await flush();
    // Gỡ Web Locks để đăng xuất chạy thẳng, không xếp hàng sau đổi mật khẩu: tới lúc nhả khoá thì
    // đăng xuất đã xong, `epoch` đã đổi và `logoutPromise` đã về null (chỉ còn kiểm `epoch` chặn được)
    stubLocks(undefined);
    await logout();
    stubLocks(locks);
    release();
    expect(await done).toBeInstanceOf(RequestAbortedError);
    expect(changeRequests()).toHaveLength(0);
  });
});

describe('lỗi khác: không tự thử lại', () => {
  it('CS-13 DM-03 400 MAT_KHAU_CU_SAI: không làm mới, một lần gửi', async () => {
    await signIn();
    api.failNext(PATH, () => apiError(400, 'MAT_KHAU_CU_SAI'));
    await expect(changePassword(INPUT)).rejects.toMatchObject({
      status: 400,
      maLoi: 'MAT_KHAU_CU_SAI',
    });
    expect(api.refreshCalls).toBe(0);
    expect(changeRequests()).toHaveLength(1);
  });

  it('CS-14 mất mạng: NetworkError, một lần gửi', async () => {
    await signIn();
    api.failNext(PATH, () => Promise.reject(new TypeError('net')));
    await expect(changePassword(INPUT)).rejects.toBeInstanceOf(NetworkError);
    expect(changeRequests()).toHaveLength(1);
  });

  it('CS-15 504 của nginx: UnexpectedResponseError, một lần gửi', async () => {
    await signIn();
    api.failNext(PATH, () => new Response('<html>504</html>', { status: 504 }));
    await expect(changePassword(INPUT)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
    expect(changeRequests()).toHaveLength(1);
  });

  it('CS-16 request hết hạn chờ 15 giây: TimeoutError (đã gửi), một lần gửi', async () => {
    await signIn();
    vi.mocked(fetch).mockClear();
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementationOnce((_url, init) => api.hang(init));
    const outcome = changePassword(INPUT).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(15_000);
    const error = await outcome;
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error).not.toBeInstanceOf(ChangePasswordNotSentError);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('CS-17 chờ khoá quá 30 giây: ChangePasswordNotSentError, CHƯA gửi gì', async () => {
    await signIn();
    holdLock();
    vi.useFakeTimers();
    const outcome = changePassword(INPUT).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(LOCK_WAIT_TIMEOUT_MS);
    expect(await outcome).toBeInstanceOf(ChangePasswordNotSentError);
    expect(changeRequests()).toHaveLength(0);
  });
});
