import { errorMessageFor } from '../api/error-message';
import { RequestAbortedError } from '../api/errors';

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  // Nơi gọi tự huỷ thì không có gì để báo cho người dùng
  if (error instanceof RequestAbortedError) return null;

  return (
    <div
      role="alert"
      className="my-2 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
    >
      <p>{errorMessageFor(error)}</p>
      {onRetry && (
        <button
          type="button"
          className="mt-2 block font-medium underline"
          onClick={onRetry}
        >
          Thử lại
        </button>
      )}
    </div>
  );
}
