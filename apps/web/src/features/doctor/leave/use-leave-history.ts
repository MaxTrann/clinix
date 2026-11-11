import { useCallback, useEffect, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import {
  listLeaveRequests,
  type LeavePage,
  type LeaveStatus,
} from '../api/leave-api';

export type LeaveHistoryState =
  | { status: 'loading' }
  | { status: 'success'; data: LeavePage }
  | { status: 'error'; error: unknown };

/** Lịch sử yêu cầu nghỉ của chính Bác sĩ (mới nhất trước), theo trang và trạng thái. `reload` tải lại (sau khi gửi yêu cầu mới hoặc bấm "Thử lại"). */
export function useLeaveHistory(page: number, trangThai?: LeaveStatus) {
  const [state, setState] = useState<LeaveHistoryState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    // Đặt trạng thái trong timer để không gọi setState đồng bộ trong effect (cùng cách với `useSchedule`)
    const timer = window.setTimeout(() => {
      setState({ status: 'loading' });
      void listLeaveRequests({ page, trangThai }, controller.signal).then(
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
  }, [page, trangThai, revision]);

  return { state, reload };
}
