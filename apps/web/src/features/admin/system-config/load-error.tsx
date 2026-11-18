import { ApiError } from '../../../shared/api/errors';
import { ErrorState } from '../../../shared/ui/error-state';
import { FORBIDDEN_MESSAGE } from './system-config-errors';

// Lỗi khi TẢI (cấu hình hoặc lịch sử): 403 có câu riêng (route đã chặn Admin Chi nhánh, đây là lớp thứ ba khi máy chủ vẫn từ chối),
// còn lại dùng `ErrorState` chung (mất mạng, hết hạn chờ, 5xx) kèm "Thử lại".
export function LoadError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  if (error instanceof ApiError && error.status === 403) {
    return (
      <p
        role="alert"
        className="my-2 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
      >
        {FORBIDDEN_MESSAGE}
      </p>
    );
  }
  return <ErrorState error={error} onRetry={onRetry} />;
}
