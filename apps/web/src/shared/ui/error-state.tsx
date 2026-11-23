import { errorMessageFor } from '../api/error-message';
import { RequestAbortedError } from '../api/errors';
import { ERROR_VARIANTS, errorVariantOf } from './error-variant';

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

// Khối lỗi nhỏ trong trang. Từ doctor UX4 (G18): thêm icon và tiêu đề của màn 500 (cùng nguồn `ERROR_VARIANTS`) nhưng GIỮ NGUYÊN câu cũ của
// `errorMessageFor` (dùng chung với nhiều form) và props, nên 55 nơi gọi không đổi. Tiêu đề là `<p>` chứ không phải heading, để không đổi đại cương của
// trang; KHÔNG chuyển focus (khối này có thể hiện giữa lúc người dùng đang gõ).
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  // Nơi gọi tự huỷ thì không có gì để báo cho người dùng
  if (error instanceof RequestAbortedError) return null;

  const { icon: Icon, title } = ERROR_VARIANTS[errorVariantOf(error)];
  return (
    <div
      role="alert"
      className="my-2 flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
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
    </div>
  );
}
