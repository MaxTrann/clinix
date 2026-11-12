import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import {
  knownBookingError,
  eligibilityBlockMessage,
} from '../api/booking-errors';
import { getEligibility } from '../api/booking-service';
import type { EligibilityResult } from '../api/booking-types';
import { BookingNotice } from './booking-notice';

type GateState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: EligibilityResult };

// Hook tải riêng của cổng, không dùng `useRemote` vì nó nằm ở `features/search` (cấm import chéo) và F3 chỉ tải đúng một thứ
// (TRACKING 3.22 (j); khi `useRemote` lên `shared/hooks/` thì đổi sang dùng nó). Mỗi lần "Thử lại" là một `attempt` mới; "đang tải"
// suy ra từ `attempt` thay vì `setState` trong effect, nên kết quả của lần trước không bao giờ hiện cho lần sau.
function useEligibility(): { state: GateState; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{
    attempt: number;
    result: Exclude<GateState, { status: 'loading' }>;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getEligibility(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setSettled({ attempt, result: { status: 'ready', data } });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || error instanceof RequestAbortedError) {
          return;
        }
        setSettled({ attempt, result: { status: 'error', error } });
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state: GateState =
    settled !== null && settled.attempt === attempt
      ? settled.result
      : { status: 'loading' };
  return { state, retry };
}

// Đóng khi lỗi: chỉ ĐÚNG `true` mới cho qua (thiếu trường, chuỗi "true" hay thân lạ đều chặn)
function isAllowed(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { choPhepDatLich?: unknown }).choPhepDatLich === true
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      className="mt-2 block font-medium underline"
      onClick={onRetry}
    >
      Thử lại
    </button>
  );
}

// Cổng A4 của Bước 4 (PLAN 5.13, Q26): gọi `GET /booking/eligibility`; bị khoá no-show thì hiện thông báo và KHÔNG render Bước 4.
// Câu chọn theo `maLoi` (và `lyDo` của kết quả), không theo mã HTTP: B7 trả 200 kể cả khi khoá. Thanh toán và Hoàn tất KHÔNG qua cổng
// này: lịch đã có không bị huỷ vì khoá (Q26).
export function EligibilityGate({ children }: { children: ReactNode }) {
  const { state, retry } = useEligibility();

  if (state.status === 'loading') return <LoadingState />;

  if (state.status === 'error') {
    const known = knownBookingError(state.error);
    if (known === undefined) {
      return <ErrorState error={state.error} onRetry={retry} />;
    }
    return (
      <BookingNotice message={known.message}>
        {known.retryable && <RetryButton onRetry={retry} />}
      </BookingNotice>
    );
  }

  if (!isAllowed(state.data)) {
    return (
      <BookingNotice message={eligibilityBlockMessage(state.data?.lyDo)} />
    );
  }
  return <>{children}</>;
}
