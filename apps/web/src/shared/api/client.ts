import { getApiAuthHooks } from './auth-hooks';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
  type ApiErrorBody,
} from './errors';

// Lớp API client DUY NHẤT của web (task P6): chỉ file này được gọi `fetch`.
export const DEFAULT_TIMEOUT_MS = 15_000;
// Cho lời gọi gửi mail và upload: phải lớn hơn thời gian chờ của MailService (TECH_DEBT dòng 20) và nhỏ hơn proxy_read_timeout 60 giây của nginx.
export const LONG_TIMEOUT_MS = 45_000;

const DEFAULT_BASE_URL = '/api';

type QueryValue = string | number | boolean | null | undefined;

// Thân chỉ là JSON hoặc FormData vì lần thử lại sau làm mới token phải gửi lại được; stream chỉ đọc được một lần nên không hỗ trợ.
type RequestBody =
  { json?: unknown; body?: never } | { body?: FormData; json?: never };

export type RequestOptions = RequestBody & {
  method?: string;
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  // Không gắn Authorization: login, refresh, logout không dùng access token
  skipAuthToken?: boolean;
};

function buildUrl(path: string, query: RequestOptions['query']): string {
  // Dùng `||`: build không truyền biến (hoặc truyền rỗng) thì vẫn về cùng origin
  const baseUrl = (import.meta.env.VITE_API_URL || DEFAULT_BASE_URL).replace(
    /\/+$/,
    '',
  );
  const url = `${baseUrl}/${path.replace(/^\/+/, '')}`;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

function buildInit(
  options: RequestOptions,
  token: string | null,
  binary = false,
): RequestInit {
  const headers = new Headers(options.headers);
  // Tải nhị phân (chat F1): nhận mọi kiểu; lỗi vẫn là thân JSON của API
  headers.set('Accept', binary ? '*/*' : 'application/json');
  if (token !== null) headers.set('Authorization', `Bearer ${token}`);

  let body: BodyInit | undefined = options.body;
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.json);
  }
  return {
    method: options.method ?? 'GET',
    headers,
    body,
    credentials: 'same-origin',
  };
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const { maLoi, thongBao } = value as Partial<ApiErrorBody>;
  return typeof maLoi === 'string' && typeof thongBao === 'string';
}

function parseResponse<T>(status: number, text: string): T {
  const succeeded = status >= 200 && status < 300;
  if (succeeded && text === '') return undefined as T;

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new UnexpectedResponseError(status);
  }
  if (succeeded) return body as T;
  if (isErrorBody(body)) throw new ApiError(status, body);
  throw new UnexpectedResponseError(status);
}

// Gửi đúng một lần. Hẹn giờ bao cả lúc đọc thân: phản hồi có thể treo giữa chừng sau khi đã nhận header.
async function send<T>(
  url: string,
  options: RequestOptions,
  token: string | null,
): Promise<T> {
  const { signal: callerSignal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  if (callerSignal?.aborted) throw new RequestAbortedError();

  const controller = new AbortController();
  const abort = () => controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
  }, timeoutMs);
  callerSignal?.addEventListener('abort', abort);

  let status: number;
  let text: string;
  try {
    const response = await fetch(url, {
      ...buildInit(options, token),
      signal: controller.signal,
    });
    status = response.status;
    text = await response.text();
  } catch {
    if (timedOut) throw new TimeoutError();
    if (callerSignal?.aborted) throw new RequestAbortedError();
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', abort);
  }
  return parseResponse<T>(status, text);
}

// Chờ hook, nhưng nơi gọi vẫn huỷ được ngay. Hook ném lỗi được coi như không phục hồi: nơi gọi nhận ApiError 401 gốc,
// vì đó là thứ duy nhất nó biết xử lý theo `maLoi`; F1 tự xử lý lỗi của mình bên trong hook.
function waitForRecovery(
  recover: () => Promise<boolean>,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const onAbort = () => reject(new RequestAbortedError());
    signal?.addEventListener('abort', onAbort, { once: true });

    Promise.resolve()
      .then(recover)
      .then(resolve, () => resolve(false))
      .finally(() => signal?.removeEventListener('abort', onAbort));
  });
}

function withSessionSignal(options: RequestOptions): RequestOptions {
  const sessionSignal = getApiAuthHooks()?.getRequestSignal?.();
  if (!sessionSignal) return options;
  const signal = options.signal
    ? AbortSignal.any([options.signal, sessionSignal])
    : sessionSignal;
  return { ...options, signal };
}

export async function request<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = buildUrl(path, options.query);
  const token = () =>
    options.skipAuthToken
      ? null
      : (getApiAuthHooks()?.getAccessToken() ?? null);
  const sendOptions = withSessionSignal(options);
  const sentToken = token();

  try {
    return await send<T>(url, sendOptions, sentToken);
  } catch (error) {
    const hooks = getApiAuthHooks();
    if (!(error instanceof ApiError) || error.status !== 401 || !hooks) {
      throw error;
    }
    const recovered = await waitForRecovery(
      () =>
        hooks.recoverFromUnauthorized({ path, error, accessToken: sentToken }),
      sendOptions.signal,
    );
    if (!recovered) throw error;
    return send<T>(url, sendOptions, token());
  }
}

// ---- Tải nhị phân (chat F1: tệp đính kèm) ----
// Nhánh RIÊNG, không dựng lại `send`/`request` ở trên: đường đi (và số bước promise) của `request` giữ đúng như cũ, vì các test dùng đồng hồ giả
// của module khác phụ thuộc vào nó. Cùng luật: hẹn giờ bao cả lúc đọc thân, huỷ, phân loại lỗi, 401 thì phục hồi phiên rồi gửi lại ĐÚNG một lần.

/** Tệp tải về: byte và hai header để nơi gọi đặt tên, chọn cách hiện (ảnh hay PDF). */
export interface BinaryResponse {
  blob: Blob;
  contentType: string | null;
  contentDisposition: string | null;
}

async function sendBinary(
  url: string,
  options: RequestOptions,
  token: string | null,
): Promise<BinaryResponse> {
  const { signal: callerSignal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  if (callerSignal?.aborted) throw new RequestAbortedError();

  const controller = new AbortController();
  const abort = () => controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
  }, timeoutMs);
  callerSignal?.addEventListener('abort', abort);

  let status: number;
  let text: string;
  try {
    const response = await fetch(url, {
      ...buildInit(options, token, true),
      signal: controller.signal,
    });
    status = response.status;
    if (response.ok)
      return {
        blob: await response.blob(),
        contentType: response.headers.get('Content-Type'),
        contentDisposition: response.headers.get('Content-Disposition'),
      };
    // Lỗi: đọc chữ để ra `ApiError` như mọi lời gọi khác
    text = await response.text();
  } catch {
    if (timedOut) throw new TimeoutError();
    if (callerSignal?.aborted) throw new RequestAbortedError();
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', abort);
  }
  parseResponse(status, text);
  // Thân lỗi là JSON nhưng không đúng khuôn lỗi (parseResponse đã ném ở mọi nhánh khác)
  throw new UnexpectedResponseError(status);
}

/** Tải byte. Cùng hẹn giờ, huỷ, lỗi và làm mới phiên như `request`; chỉ khác là thân 2xx giữ nguyên dạng byte. */
export async function requestBinary(
  path: string,
  options: Omit<RequestOptions, 'json' | 'body'> = {},
): Promise<BinaryResponse> {
  const url = buildUrl(path, options.query);
  const token = () =>
    options.skipAuthToken
      ? null
      : (getApiAuthHooks()?.getAccessToken() ?? null);
  const sendOptions = withSessionSignal(options);
  const sentToken = token();

  try {
    return await sendBinary(url, sendOptions, sentToken);
  } catch (error) {
    const hooks = getApiAuthHooks();
    if (!(error instanceof ApiError) || error.status !== 401 || !hooks) {
      throw error;
    }
    const recovered = await waitForRecovery(
      () =>
        hooks.recoverFromUnauthorized({ path, error, accessToken: sentToken }),
      sendOptions.signal,
    );
    if (!recovered) throw error;
    return sendBinary(url, sendOptions, token());
  }
}
