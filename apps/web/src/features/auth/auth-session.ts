import {
  setApiAuthHooks,
  type ApiAuthHooks,
} from '../../shared/api/auth-hooks';
import { request } from '../../shared/api/client';
import {
  ApiError,
  RequestAbortedError,
  TimeoutError,
} from '../../shared/api/errors';
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
const CHANGE_PASSWORD_PATH = '/auth/change-password';
// Hook làm mới bỏ qua 401 của các đường này:
// - login, refresh, logout: 401 của chúng không phải dấu hiệu access token hết hạn (TRACKING auth mục 5 điểm 14, 15, 16);
// - change-password: chạy TRONG khoá refresh, mà hook làm mới lại xin chính khoá đó (Web Locks không vào lại được) nên sẽ kẹt
//   tới hạn chờ khoá 30 giây. `changePassword()` tự phục hồi SAU KHI nhả khoá (TRACKING auth F5-B).
const EXCLUDED_PATHS = new Set([
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  CHANGE_PASSWORD_PATH,
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
// Số thứ tự các lần làm mới tên (refreshCurrentUser) và số của lần đã áp dụng gần nhất:
// lần cũ hơn về muộn thì bị bỏ, để tên của lần lưu sau luôn thắng
let userRefreshCalls = 0;
let userRefreshApplied = 0;

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

function authenticatedUser(): AuthUser | null {
  const { status, user } = getAuthState();
  return status === 'authenticated' ? user : null;
}

// Đọc lại /auth/me để thanh bên đổi tên ngay sau khi lưu hồ sơ (patient P2, H8). KHÔNG BAO GIỜ ném lỗi: true = đã áp dụng
// tên đọc được, false = mọi trường hợp còn lại, nơi gọi chỉ cần biết thanh bên đã đổi tên hay chưa.
// Khác restoreSession: lỗi ở đây không được biến cả ứng dụng thành màn lỗi, nên chỉ ghi `hoTen` và không đụng `status`,
// `error`, `canRetry` (vai trò đổi giữa phiên sẽ do lần khôi phục sau xử lý, không đẩy người dùng đi khi đang sửa form).
// /auth/me chạy ngoài khoá như AU-39. 401 do hook của client xử lý như mọi request khác, hàm không làm lại.
export async function refreshCurrentUser(): Promise<boolean> {
  if (authenticatedUser() === null) return false;
  const started = epoch;
  const call = ++userRefreshCalls;

  let profile: AuthUser;
  try {
    profile = await fetchProfile();
  } catch {
    // Mất mạng, timeout, 4xx/5xx, bị huỷ lúc đăng xuất, 401 mà hook không cứu được: giữ nguyên, không thử lại
    return false;
  }

  // Kiểm lại SAU khi chờ: phiên có thể đã bị xoá mà `epoch` không đổi (clearSession), hoặc đã đổi chủ (epoch tăng)
  const user = authenticatedUser();
  if (user === null || started !== epoch || call < userRefreshApplied) {
    return false;
  }
  userRefreshApplied = call;
  // Tên không đổi thì giữ nguyên tham chiếu `user`, không báo cho người nghe
  if (profile.hoTen !== user.hoTen) {
    setAuthState({ user: { ...user, hoTen: profile.hoTen } });
  }
  return true;
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

// Một 401 của request mang `sentToken`: true = đã có token mới, gửi lại được. Dùng chung cho hook của client và `changePassword()`.
async function recoverSession(
  error: ApiError,
  sentToken: string | null,
): Promise<boolean> {
  // Token đã đổi so với lúc gửi: đã có lần làm mới hoặc đăng nhập xong, lỗi này thuộc token cũ
  const current = getAccessToken();
  if (current !== null && current !== sentToken) return true;

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
}

export interface ChangePasswordInput {
  matKhauCu: string;
  matKhauMoi: string;
  xacNhan: string;
}

// Chờ khoá quá hạn: request CHƯA được gửi nên chắc chắn mật khẩu chưa đổi (khác TimeoutError của chính request: không rõ kết quả)
export class ChangePasswordNotSentError extends Error {
  constructor() {
    super('Chưa gửi được yêu cầu đổi mật khẩu');
    this.name = 'ChangePasswordNotSentError';
  }
}

// Gửi MỘT lần dưới khoá refresh: refresh mang cookie cũ đang bay lúc đổi mật khẩu commit sẽ làm phiên bị thu hồi (TECH_DEBT dòng 48).
// `onSend` nhận token mà lần gửi này mang, để phục hồi đúng như hook.
async function sendChangePassword(
  input: ChangePasswordInput,
  started: number,
  onSend?: (token: string | null) => void,
): Promise<void> {
  // Chỉ ba trường: tài khoản lấy từ access token, trường lạ bị API từ chối
  const { matKhauCu, matKhauMoi, xacNhan } = input;
  let sent = false;
  try {
    await withAuthLock(async () => {
      // Đăng xuất đã bắt đầu hoặc phiên đã đổi trong lúc chờ khoá: không gửi mật khẩu nữa. Phải kiểm cả `logoutPromise`:
      // logout nhả khoá TRƯỚC khi tăng `epoch`, nên request đang xếp hàng sau nó được cấp khoá khi `epoch` chưa đổi (CS-12).
      if (started !== epoch || logoutPromise !== null) {
        throw new RequestAbortedError();
      }
      sent = true;
      onSend?.(getAccessToken());
      await request(CHANGE_PASSWORD_PATH, {
        method: 'POST',
        json: { matKhauCu, matKhauMoi, xacNhan },
      });
    });
  } catch (error) {
    if (!sent && error instanceof TimeoutError) {
      throw new ChangePasswordNotSentError();
    }
    throw error;
  }
}

// Đổi mật khẩu (A13). Thành công: cookie refresh đã xoay, access token đang giữ vẫn dùng được, người dùng vẫn đăng nhập.
// KHÔNG tự thử lại khi mất mạng hay hết hạn chờ (không biết mật khẩu đã đổi chưa). Chỉ 401 mới được gửi lại, đúng một lần:
// 401 do guard trả trước khi máy chủ xử lý gì. Không nhận `signal`: huỷ request đang bay có thể làm mất Set-Cookie của lần xoay.
export async function changePassword(
  input: ChangePasswordInput,
): Promise<void> {
  const started = epoch;
  let sentToken: string | null = null;
  try {
    await sendChangePassword(input, started, (token) => {
      sentToken = token;
    });
    return;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    // Phục hồi NGOÀI khoá: làm mới cần chính khoá này (F5-B)
    if (!(await recoverSession(error, sentToken))) throw error;
  }
  await sendChangePassword(input, started);
}

const authHooks: ApiAuthHooks = {
  getAccessToken,
  getRequestSignal: () => sessionRequests.signal,

  recoverFromUnauthorized({ path, error, accessToken }) {
    if (EXCLUDED_PATHS.has(normalizePath(path))) return Promise.resolve(false);
    return recoverSession(error, accessToken);
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
  userRefreshCalls = 0;
  userRefreshApplied = 0;
  setApiAuthHooks(authHooks);
}
