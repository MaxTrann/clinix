import {
  setApiAuthHooks,
  type ApiAuthHooks,
} from '../../shared/api/auth-hooks';
import { request } from '../../shared/api/client';
import { ApiError } from '../../shared/api/errors';
import {
  getAccessToken,
  getAuthState,
  resetAuthStore,
  setAccessToken,
  setAuthState,
  type AuthUser,
} from './auth-store';
import { withAuthLock } from './refresh-lock';

// Hook làm mới không nằm trong timeout của client, nên hạn của lần làm mới đặt ngay trên chính request này
const REFRESH_TIMEOUT_MS = 15_000;

const SESSION_ENDED = 'PHIEN_HET_HIEU_LUC';
const REFRESHABLE_CODES = new Set(['TOKEN_KHONG_HOP_LE', 'CHUA_DANG_NHAP']);
const ORIGIN_REJECTED = 'ORIGIN_KHONG_HOP_LE';
// 401 của các đường này không phải dấu hiệu access token hết hạn (TRACKING auth mục 5 điểm 14, 15, 16)
const EXCLUDED_PATHS = new Set([
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
]);

let refreshPromise: Promise<void> | null = null;
let restorePromise: Promise<void> | null = null;
let logoutPromise: Promise<void> | null = null;
// Tăng khi phiên đổi chủ (đăng nhập, đăng xuất): kết quả của việc bắt đầu trước đó không được ghi đè trạng thái mới
let epoch = 0;
// Huỷ làm mới đang CHỜ khoá khi đăng xuất
let refreshWait = new AbortController();
// Huỷ mọi request đang bay của phiên khi đăng xuất
let sessionRequests = new AbortController();

// `path` là nguyên văn nơi gọi truyền: có thể thiếu hoặc thừa dấu /, có query
function normalizePath(path: string): string {
  const [pathname] = path.split(/[?#]/);
  return `/${pathname.replace(/^\/+|\/+$/g, '')}`;
}

function clearSession(sessionEnded: boolean): void {
  const { status, sessionEnded: current } = getAuthState();
  setAccessToken(null);
  setAuthState({
    status: 'unauthenticated',
    user: null,
    error: null,
    canRetry: false,
    // Đã ở trạng thái chưa đăng nhập thì không có phiên nào vừa kết thúc
    sessionEnded: current || (sessionEnded && status !== 'unauthenticated'),
  });
}

// Single-flight trong tab, xếp hàng giữa các tab. Ném nguyên lỗi của request; không bao giờ tự thử lại (có thể server đã xoay token).
function refreshSession(): Promise<void> {
  const started = epoch;
  refreshPromise ??= withAuthLock(async () => {
    const { accessToken } = await request<{ accessToken: string }>(
      '/auth/refresh',
      {
        method: 'POST',
        skipAuthToken: true,
        timeoutMs: REFRESH_TIMEOUT_MS,
      },
    );
    if (started === epoch) setAccessToken(accessToken);
  }, refreshWait.signal).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

function fetchProfile(): Promise<AuthUser> {
  return request<AuthUser>('/auth/me');
}

function applyProfile(user: AuthUser): void {
  setAuthState({
    status: 'authenticated',
    user,
    sessionEnded: false,
    error: null,
    canRetry: false,
  });
}

function applyFailure(error: unknown): void {
  if (error instanceof ApiError && error.status === 401) {
    clearSession(error.maLoi === SESSION_ENDED);
    return;
  }
  const originRejected =
    error instanceof ApiError && error.maLoi === ORIGIN_REJECTED;
  // Lỗi tạm thời KHÔNG phải đã đăng xuất. Lỗi cấu hình Origin thì thử lại cũng vô ích.
  setAuthState({ status: 'error', error, canRetry: !originRejected });
}

async function runRestore(): Promise<void> {
  const started = epoch;
  try {
    // Đã có token nghĩa là chỉ bước /auth/me lỗi: không tốn thêm một lần xoay. /auth/me chạy ngoài khoá.
    if (getAccessToken() === null) await refreshSession();
    const user = await fetchProfile();
    if (started === epoch) applyProfile(user);
  } catch (error) {
    if (started === epoch) applyFailure(error);
  }
}

// Gọi một lần trong main.tsx, không trong effect: StrictMode chạy effect hai lần, và hai làm mới cùng cookie làm phiên bị thu hồi.
export function restoreSession(): Promise<void> {
  if (getAuthState().status !== 'checking') return Promise.resolve();
  restorePromise ??= runRestore().finally(() => {
    restorePromise = null;
  });
  return restorePromise;
}

export function retrySession(): Promise<void> {
  setAuthState({ status: 'checking', error: null, canRetry: false });
  return restoreSession();
}

// Ném nguyên lỗi cho F3. Lỗi ở /auth/me thì phiên đã tạo: F3 dùng retrySession(), không gọi lại login().
export async function login(email: string, matKhau: string): Promise<void> {
  const { accessToken } = await request<{ accessToken: string }>(
    '/auth/login',
    {
      method: 'POST',
      json: { email, matKhau },
      skipAuthToken: true,
    },
  );
  epoch += 1;
  setAccessToken(accessToken);
  try {
    applyProfile(await fetchProfile());
  } catch (error) {
    applyFailure(error);
    throw error;
  }
}

async function runLogout(): Promise<void> {
  // Bỏ làm mới đang chờ khoá; làm mới đang bay thì để xong, logout đứng sau nó nên gửi đúng cookie mới nhất
  refreshWait.abort();
  refreshWait = new AbortController();

  await withAuthLock(() =>
    request('/auth/logout', { method: 'POST', skipAuthToken: true }),
  );

  // Chỉ tới đây mới chắc đã đăng xuất; 403, 5xx, mất mạng hay timeout đều giữ nguyên trạng thái (TRACKING auth mục 5 điểm 16)
  epoch += 1;
  setAccessToken(null);
  setAuthState({
    status: 'unauthenticated',
    user: null,
    sessionEnded: false,
    error: null,
    canRetry: false,
  });
  sessionRequests.abort();
  sessionRequests = new AbortController();
}

export function logout(): Promise<void> {
  logoutPromise ??= runLogout().finally(() => {
    logoutPromise = null;
  });
  return logoutPromise;
}

const authHooks: ApiAuthHooks = {
  getAccessToken,
  getRequestSignal: () => sessionRequests.signal,

  async recoverFromUnauthorized({ path, error, accessToken }) {
    if (EXCLUDED_PATHS.has(normalizePath(path))) return false;

    // Token đã đổi so với lúc gửi: đã có lần làm mới hoặc đăng nhập xong, lỗi này thuộc token cũ
    const current = getAccessToken();
    if (current !== null && current !== accessToken) return true;

    if (error.maLoi === SESSION_ENDED) {
      clearSession(true);
      return false;
    }
    if (!REFRESHABLE_CODES.has(error.maLoi)) return false;

    try {
      await refreshSession();
      return true;
    } catch (refreshError) {
      // Mất mạng, timeout, 5xx, 403: không biết phiên ra sao nên giữ nguyên người dùng
      if (refreshError instanceof ApiError && refreshError.status === 401) {
        clearSession(true);
      }
      return false;
    }
  },
};

// Đăng ký ở mức module, không trong effect (hợp đồng P6)
setApiAuthHooks(authHooks);

export function resetAuthForTest(): void {
  resetAuthStore();
  refreshPromise = null;
  restorePromise = null;
  logoutPromise = null;
  epoch = 0;
  refreshWait = new AbortController();
  sessionRequests = new AbortController();
  setApiAuthHooks(authHooks);
}
