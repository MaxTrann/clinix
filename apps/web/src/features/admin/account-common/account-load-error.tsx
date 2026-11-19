import { RequestAbortedError } from '../../../shared/api/errors';
import { describeLoadFailure } from './account-errors';

// Lỗi khi TẢI danh sách hay chi tiết: 403 và 404 có câu riêng (PLAN 5.9), còn lại là câu chung (mạng, hết hạn chờ). Luôn có "Thử lại".
// Cùng kiểu dáng với `ErrorState` dùng chung; không dùng thẳng vì thành phần đó không phân biệt mã lỗi.

export function AccountLoadError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  // Nơi gọi tự huỷ thì không có gì để báo cho người dùng
  if (error instanceof RequestAbortedError) return null;
  return (
    <div
      role="alert"
      className="my-2 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
    >
      <p>{describeLoadFailure(error)}</p>
      <button
        type="button"
        className="mt-2 block font-medium underline"
        onClick={onRetry}
      >
        Thử lại
      </button>
    </div>
  );
}
