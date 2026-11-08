import { RequestAbortedError } from '../../../shared/api/errors';
import { ErrorState } from '../../../shared/ui/error-state';
import { isSessionEnded } from '../profile/profile-errors';
import { lookupErrorMessage } from './lookup-messages';

// Lỗi của trang tra cứu (patient F8). Lỗi có câu riêng theo MÃ (400 từ khoá, 403, 404) hiện câu đó và KHÔNG có "Thử lại" (cùng yêu cầu sẽ
// cùng kết quả); mọi lỗi còn lại (mạng, quá giờ, 5xx, phản hồi lạ) dùng `ErrorState` có sẵn kèm "Thử lại", bấm mới chạy lại.
// Kiểu dáng câu riêng giống `ErrorState` để người dùng thấy cùng một loại thông báo.
export function LookupError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  // Gỡ trang hay đăng xuất (client huỷ), và 401 (phiên đã hết, khung chuyển về đăng nhập) không phải lỗi để báo thêm: như trang F3, F4
  if (error instanceof RequestAbortedError || isSessionEnded(error))
    return null;

  const message = lookupErrorMessage(error);
  if (message !== null) {
    return (
      <p
        role="alert"
        className="my-2 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
      >
        {message}
      </p>
    );
  }
  return <ErrorState error={error} onRetry={onRetry} />;
}
