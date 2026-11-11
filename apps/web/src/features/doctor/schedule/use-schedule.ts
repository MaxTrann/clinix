import { useCallback, useEffect, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import { getDoctorSchedule, type DoctorSchedule } from '../api/schedule-api';

export type ScheduleState =
  | { status: 'loading' }
  | { status: 'success'; data: DoctorSchedule }
  | { status: 'error'; error: unknown };

/** Tải lịch của chính Bác sĩ đang đăng nhập trong `tuNgay`…`denNgay` (tuần hoặc lưới tháng, ≤ 42 ngày). Đổi khoảng thì huỷ yêu cầu cũ để kết quả muộn không ghi đè. */
export function useSchedule(tuNgay: string, denNgay: string) {
  const [state, setState] = useState<ScheduleState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    // Đặt trạng thái trong timer để không gọi setState đồng bộ trong effect (cùng cách với `useClinicInfo`)
    const timer = window.setTimeout(() => {
      setState({ status: 'loading' });
      void getDoctorSchedule({ tuNgay, denNgay }, controller.signal).then(
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
  }, [tuNgay, denNgay, revision]);

  return { state, retry };
}
