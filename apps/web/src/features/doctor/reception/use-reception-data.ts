import { useCallback, useEffect, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import {
  getReceptionBranchName,
  getReceptionGrid,
  type GridSource,
  listReceptionDoctors,
  type ReceptionDoctor,
  type ReceptionGrid,
  type ReceptionGridQuery,
} from '../api/reception-api';

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: unknown };

// Mẫu chung: gọi `load` khi `key` đổi hoặc `retry`, huỷ yêu cầu cũ để kết quả muộn không ghi đè (cùng cách với `useSchedule`).
export function useLoad<T>(
  load: (signal: AbortSignal) => Promise<T>,
  key: string,
): { state: LoadState<T>; retry: () => void } {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    // Đặt trạng thái trong timer để không gọi setState đồng bộ trong effect
    const timer = window.setTimeout(() => {
      setState({ status: 'loading' });
      void load(controller.signal).then(
        (data) => setState({ status: 'success', data }),
        (error: unknown) => {
          if (controller.signal.aborted || error instanceof RequestAbortedError)
            return;
          setState({ status: 'error', error });
        },
      );
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // `load` được dựng lại mỗi lần render; chỉ `key` (tham số thật) và `revision` quyết định có tải lại hay không
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, revision]);

  return { state, retry };
}

/** Lưới lịch của các bác sĩ trong phạm vi Lễ tân cho một tuần, theo bộ lọc (chuyên khoa, bác sĩ, ca) và trang. */
export function useReceptionGrid(
  source: GridSource,
  query: ReceptionGridQuery,
  // Tăng lên để tải lại lưới (sau khi phân công hoặc gỡ ca, doctor F7)
  refresh = 0,
) {
  return useLoad<ReceptionGrid>(
    (signal) => getReceptionGrid(source, query, signal),
    JSON.stringify([source, query, refresh]),
  );
}

/** Danh sách bác sĩ để chọn ở bộ lọc (một lần khi mở trang). */
export function useReceptionDoctors(source: GridSource) {
  return useLoad<ReceptionDoctor[]>(
    async (signal) => (await listReceptionDoctors(source, signal)).items,
    `doctors:${source}`,
  );
}

/** Tên chi nhánh của Lễ tân; không có thì `null` (lỗi bị nuốt: chip chi nhánh chỉ là thông tin phụ). */
export function useReceptionBranchName(): string | null {
  const { state } = useLoad<string | null>(
    (signal) => getReceptionBranchName(signal).catch(() => null),
    'branch',
  );
  return state.status === 'success' ? state.data : null;
}
