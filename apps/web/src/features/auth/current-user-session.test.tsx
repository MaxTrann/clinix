import { act, render, screen } from '@testing-library/react';
import { request } from '../../shared/api/client';
import {
  apiError,
  createFakeAuthApi,
  createFakeLocks,
  type FakeAccount,
} from '../../test/fake-auth-api';
import * as session from './auth-session';
import {
  isValidFullName,
  isValidPhone,
  login,
  logout,
  refreshCurrentUser,
  restoreSession,
  trimAsciiWhitespace,
  useAuth,
} from './index';
import { getAccessToken, getAuthState } from './auth-store';
import * as policy from './validation/account-policy';

// Task patient P2 (TRACKING patient P2-E): refreshCurrentUser() và các export mới của index.ts.
// Mã ca RU-nn, EX-nn là [đề xuất]; ca phủ test case của PLAN ghi kèm mã đó (HS-19 chỉ phần store, phần giao diện ở F3).
let api: ReturnType<typeof createFakeAuthApi>;
let locks: ReturnType<typeof createFakeLocks>;
let account: FakeAccount;

const profile = (hoTen: string): FakeAccount => ({
  vaiTro: 'BenhNhan',
  hoTen,
  daXacMinhEmail: true,
});

// Đặt store vào trạng thái đã đăng nhập (token `tok-1`), rồi xoá số đếm để ca chỉ đếm request của chính nó
async function signIn() {
  await login('a@example.invalid', 'mat-khau');
  api.requests.length = 0;
  api.refreshCalls = 0;
  api.meCalls = 0;
  locks.requests = 0;
}

beforeEach(() => {
  session.resetAuthForTest();
  account = profile('Tên cũ');
  api = createFakeAuthApi(account);
  locks = createFakeLocks();
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: locks,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('đọc lại tên', () => {
  it('RU-01 (HS-19 phần store) đổi tên ở máy chủ: store có tên mới, một GET /auth/me, không làm mới, không khoá', async () => {
    await signIn();
    account.hoTen = 'Tên mới';

    expect(await refreshCurrentUser()).toBe(true);

    expect(getAuthState()).toMatchObject({
      status: 'authenticated',
      user: { hoTen: 'Tên mới' },
    });
    expect(api.requests.map((r) => r.path)).toEqual(['/auth/me']);
    expect(api.requests[0].headers.get('Authorization')).toBe('Bearer tok-1');
    expect(api.refreshCalls).toBe(0);
    expect(locks.requests).toBe(0);
  });

  it('RU-02 chỉ đổi hoTen: vaiTro, daXacMinhEmail và các cờ giữ nguyên dù máy chủ trả khác', async () => {
    await signIn();
    account.hoTen = 'Tên mới';
    account.vaiTro = 'LeTan';
    account.daXacMinhEmail = false;

    expect(await refreshCurrentUser()).toBe(true);

    expect(getAuthState()).toMatchObject({
      status: 'authenticated',
      user: { vaiTro: 'BenhNhan', hoTen: 'Tên mới', daXacMinhEmail: true },
      sessionEnded: false,
      error: null,
      canRetry: false,
    });
  });

  it('RU-03 (HS-19 phần store) component đọc useAuth() đổi chữ sau khi gọi', async () => {
    await signIn();
    function SidebarName() {
      const { user } = useAuth();
      return <p>{user?.hoTen}</p>;
    }
    render(<SidebarName />);
    expect(screen.getByText('Tên cũ')).toBeTruthy();

    await act(async () => {
      account.hoTen = 'Tên mới';
      await refreshCurrentUser();
    });

    expect(screen.getByText('Tên mới')).toBeTruthy();
    expect(screen.queryByText('Tên cũ')).toBeNull();
  });

  it('RU-04 tên không đổi: trả true, store giữ nguyên tham chiếu (không báo người nghe)', async () => {
    await signIn();
    const before = getAuthState();

    expect(await refreshCurrentUser()).toBe(true);

    // setAuthState luôn tạo object mới, nên cùng tham chiếu nghĩa là không gọi nó
    expect(getAuthState()).toBe(before);
    expect(getAuthState().user).toBe(before.user);
    expect(api.meCalls).toBe(1);
  });
});

describe('không đăng nhập thì không gọi', () => {
  // Sau resetAuthForTest store đang ở `checking`
  const toChecking = () => undefined;
  async function toUnauthenticated() {
    await restoreSession();
  }
  async function toError() {
    api.startSession();
    api.failNext('/auth/me', () => apiError(500, 'LOI_HE_THONG'));
    await restoreSession();
  }

  it.each([
    ['checking', toChecking],
    ['unauthenticated', toUnauthenticated],
    ['error', toError],
  ])('RU-05 status %s: không gửi request, false', async (status, setup) => {
    await setup();
    expect(getAuthState().status).toBe(status);
    api.requests.length = 0;
    const before = getAuthState();

    expect(await refreshCurrentUser()).toBe(false);

    expect(api.requests).toEqual([]);
    expect(getAuthState()).toBe(before);
  });
});

describe('lỗi: false, store y nguyên, không thử lại', () => {
  it.each([
    ['mất mạng', () => Promise.reject(new TypeError('x'))],
    ['500 JSON', () => apiError(500, 'LOI_HE_THONG')],
    ['502 HTML', () => new Response('<html>', { status: 502 })],
  ])('RU-06 %s', async (_name, respond) => {
    await signIn();
    account.hoTen = 'Tên mới';
    api.failNext('/auth/me', respond);
    const before = getAuthState();

    expect(await refreshCurrentUser()).toBe(false);

    expect(getAuthState()).toBe(before);
    expect(getAuthState().user?.hoTen).toBe('Tên cũ');
    expect(api.meCalls).toBe(1);
    expect(api.refreshCalls).toBe(0);
  });

  it('RU-07 timeout: false, store y nguyên, đúng một lần gọi', async () => {
    await signIn();
    vi.mocked(fetch).mockClear();
    const before = getAuthState();
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementationOnce((_url, init) => api.hang(init));

    const done = refreshCurrentUser();
    await vi.advanceTimersByTimeAsync(15_000);

    expect(await done).toBe(false);
    expect(getAuthState()).toBe(before);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('401 do hook của client xử lý', () => {
  it('RU-08 PHIEN_HET_HIEU_LUC: phiên bị xoá bởi hook, hàm trả false và không ném', async () => {
    await signIn();
    api.failNext('/auth/me', () => apiError(401, 'PHIEN_HET_HIEU_LUC'));

    expect(await refreshCurrentUser()).toBe(false);

    expect(getAuthState()).toMatchObject({
      status: 'unauthenticated',
      user: null,
      sessionEnded: true,
    });
    expect(getAccessToken()).toBeNull();
    expect(api.meCalls).toBe(1);
    expect(api.refreshCalls).toBe(0);
  });

  it('RU-09 TOKEN_KHONG_HOP_LE: hook làm mới đúng một lần, gửi lại bằng token mới, tên được cập nhật', async () => {
    await signIn();
    account.hoTen = 'Tên mới';
    api.failNext('/auth/me', () => apiError(401, 'TOKEN_KHONG_HOP_LE'));

    expect(await refreshCurrentUser()).toBe(true);

    expect(api.refreshCalls).toBe(1);
    expect(
      api.requests
        .filter((r) => r.path === '/auth/me')
        .map((r) => r.headers.get('Authorization')),
    ).toEqual(['Bearer tok-1', 'Bearer tok-2']);
    expect(getAuthState()).toMatchObject({
      status: 'authenticated',
      user: { hoTen: 'Tên mới' },
    });
  });

  it('RU-10 mã 401 lạ: hook không làm gì, false, store y nguyên', async () => {
    await signIn();
    api.failNext('/auth/me', () => apiError(401, 'MA_LA'));
    const before = getAuthState();

    expect(await refreshCurrentUser()).toBe(false);

    expect(getAuthState()).toBe(before);
    expect(api.meCalls).toBe(1);
    expect(api.refreshCalls).toBe(0);
  });
});

describe('đua với đăng xuất và đổi phiên', () => {
  it('RU-11 đăng xuất giữa chừng, phản hồi vẫn về: không làm sống lại người dùng', async () => {
    await signIn();
    const release = api.hold('/auth/me');
    const done = refreshCurrentUser();
    await vi.waitFor(() => expect(api.meCalls).toBe(1));

    await logout();
    // Fake không nghe `signal` nên phản hồi vẫn về sau khi đăng xuất: chỉ kiểm lúc nhận mới chặn được
    release(200, profile('Tên mới'));

    expect(await done).toBe(false);
    expect(getAuthState()).toMatchObject({
      status: 'unauthenticated',
      user: null,
    });
  });

  it('RU-12 đăng xuất giữa chừng, request bị huỷ: false', async () => {
    await signIn();
    vi.mocked(fetch).mockImplementationOnce((_url, init) => api.hang(init));
    const done = refreshCurrentUser();

    await logout();

    expect(await done).toBe(false);
    expect(getAuthState()).toMatchObject({
      status: 'unauthenticated',
      user: null,
    });
  });

  it('RU-13 đăng nhập tài khoản khác giữa chừng: tên của người mới không bị ghi đè', async () => {
    await signIn();
    const release = api.hold('/auth/me');
    const done = refreshCurrentUser();
    await vi.waitFor(() => expect(api.meCalls).toBe(1));

    await logout();
    account.hoTen = 'Người mới';
    await login('b@example.invalid', 'mat-khau');
    release(200, profile('Tên của phiên cũ'));

    expect(await done).toBe(false);
    expect(getAuthState()).toMatchObject({
      status: 'authenticated',
      user: { hoTen: 'Người mới' },
    });
  });

  it('RU-14 phiên bị xoá giữa chừng mà epoch không đổi (401 của request khác): không làm sống lại', async () => {
    await signIn();
    const release = api.hold('/auth/me');
    const done = refreshCurrentUser();
    await vi.waitFor(() => expect(api.meCalls).toBe(1));

    api.failNext('/orders', () => apiError(401, 'PHIEN_HET_HIEU_LUC'));
    await request('/orders').catch(() => undefined);
    expect(getAuthState().status).toBe('unauthenticated');
    release(200, profile('Tên mới'));

    expect(await done).toBe(false);
    expect(getAuthState()).toMatchObject({
      status: 'unauthenticated',
      user: null,
    });
  });
});

describe('hai lần gọi chồng nhau', () => {
  it('RU-15 lần đầu về sau: tên của lần sau thắng; cả hai đều gửi GET /auth/me (không single-flight)', async () => {
    await signIn();
    const releaseFirst = api.hold('/auth/me');
    const first = refreshCurrentUser();
    const releaseSecond = api.hold('/auth/me');
    const second = refreshCurrentUser();
    expect(api.meCalls).toBe(2);

    releaseSecond(200, profile('Tên lần hai'));
    expect(await second).toBe(true);
    releaseFirst(200, profile('Tên lần một'));
    expect(await first).toBe(false);

    expect(getAuthState().user?.hoTen).toBe('Tên lần hai');
    expect(api.meCalls).toBe(2);
  });

  it('RU-16 lần đầu về trước, lần sau lỗi: vẫn giữ tên của lần đầu', async () => {
    await signIn();
    const releaseFirst = api.hold('/auth/me');
    const first = refreshCurrentUser();
    const releaseSecond = api.hold('/auth/me');
    const second = refreshCurrentUser();

    releaseFirst(200, profile('Tên lần một'));
    expect(await first).toBe(true);
    releaseSecond(500, { maLoi: 'LOI_HE_THONG', thongBao: 'câu của API' });
    expect(await second).toBe(false);

    expect(getAuthState()).toMatchObject({
      status: 'authenticated',
      user: { hoTen: 'Tên lần một' },
    });
  });
});

describe('bề mặt công khai của features/auth', () => {
  it('EX-01 index.ts xuất đúng các hàm đã chọn, cùng tham chiếu với bản gốc, và không xuất isPlausibleEmail', async () => {
    const publicApi = await import('./index');
    expect(publicApi.refreshCurrentUser).toBe(session.refreshCurrentUser);
    expect(publicApi.isValidFullName).toBe(policy.isValidFullName);
    expect(publicApi.isValidPhone).toBe(policy.isValidPhone);
    expect(publicApi.trimAsciiWhitespace).toBe(policy.trimAsciiWhitespace);
    expect(isValidFullName).toBe(policy.isValidFullName);
    expect(isValidPhone).toBe(policy.isValidPhone);
    expect(trimAsciiWhitespace).toBe(policy.trimAsciiWhitespace);
    expect('isPlausibleEmail' in publicApi).toBe(false);
  });
});
