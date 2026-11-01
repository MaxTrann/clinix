import { RequestAbortedError, TimeoutError } from '../../shared/api/errors';

// Khoá xếp hàng các thao tác dùng cookie refresh giữa các tab (DN-32, H12, N4): hai làm mới cùng cookie mà không xếp hàng thì phiên bị thu hồi.
export const AUTH_LOCK_NAME = 'clinix-auth-refresh';
// Chỉ giới hạn lúc CHỜ khoá. Lúc giữ khoá đã có timeout của chính request bên trong.
export const LOCK_WAIT_TIMEOUT_MS = 30_000;

// `signal` huỷ lúc đang chờ khoá; khi đã được cấp khoá thì không còn tác dụng, vì huỷ làm mới đang bay có thể làm mất Set-Cookie của lần xoay.
export async function withAuthLock<T>(
  task: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  // Web Locks chỉ có ở secure context (https, localhost). Không có thì chạy thẳng: nhiều tab không xếp hàng (TECH_DEBT dòng 49).
  const locks = navigator.locks as LockManager | undefined;
  if (!locks) return task();

  const wait = new AbortController();
  let timedOut = false;
  let granted = false;
  const abortWait = () => wait.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    abortWait();
  }, LOCK_WAIT_TIMEOUT_MS);
  signal?.addEventListener('abort', abortWait);
  const stopWaiting = () => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortWait);
  };

  try {
    return await locks.request(
      AUTH_LOCK_NAME,
      { signal: wait.signal },
      async () => {
        granted = true;
        stopWaiting();
        return task();
      },
    );
  } catch (error) {
    if (granted) throw error;
    throw timedOut ? new TimeoutError() : new RequestAbortedError();
  } finally {
    stopWaiting();
  }
}
