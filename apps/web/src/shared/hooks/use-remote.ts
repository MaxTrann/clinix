import { useCallback, useEffect, useState } from 'react';
import { RequestAbortedError } from '../api/errors';

export type RemoteState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: T };

type Settled<T> =
  { status: 'error'; error: unknown } | { status: 'ready'; data: T };

/**
 * Gọi `load` mỗi khi `deps` đổi; huỷ yêu cầu cũ để kết quả muộn không đè kết quả mới (đổi chi nhánh/từ khoá liên tục).
 * `deps` phải là giá trị nguyên thuỷ (chuỗi/số/null). `retry` chạy lại lần gọi hiện tại (nút "Thử lại").
 * Trạng thái "đang tải" suy ra từ khoá yêu cầu thay vì setState trong effect: kết quả cũ không bao giờ hiện cho yêu cầu mới.
 */
export function useRemote<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly (string | number | null)[],
): { state: RemoteState<T>; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([...deps, attempt]);
  const [settled, setSettled] = useState<{
    key: string;
    result: Settled<T>;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setSettled({ key, result: { status: 'ready', data } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || error instanceof RequestAbortedError)
          return;
        setSettled({ key, result: { status: 'error', error } });
      });
    return () => controller.abort();
    // `load` đổi theo từng lần render nên chỉ chạy lại theo `key` (do deps + attempt tạo ra)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state: RemoteState<T> =
    settled && settled.key === key ? settled.result : { status: 'loading' };
  return { state, retry };
}
