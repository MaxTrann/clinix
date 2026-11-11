import { useCallback, useEffect, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import { addDays, DAYS_IN_WEEK } from '../../../shared/schedule/week';
import { getDoctorSchedule, type DoctorSchedule } from '../api/schedule-api';

export type WeekScheduleState =
  | { status: 'loading' }
  | { status: 'success'; data: DoctorSchedule }
  | { status: 'error'; error: unknown };

/** Tải lịch của một tuần (T2–CN) của chính Bác sĩ đang đăng nhập. Đổi tuần thì huỷ yêu cầu cũ để kết quả muộn không ghi đè tuần mới. */
export function useWeekSchedule(weekStart: string) {
  const [state, setState] = useState<WeekScheduleState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    // Đặt trạng thái trong timer để không gọi setState đồng bộ trong effect (cùng cách với `useClinicInfo`)
    const timer = window.setTimeout(() => {
      setState({ status: 'loading' });
      void getDoctorSchedule(
        { tuNgay: weekStart, denNgay: addDays(weekStart, DAYS_IN_WEEK - 1) },
        controller.signal,
      ).then(
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
  }, [weekStart, revision]);

  return { state, retry };
}
