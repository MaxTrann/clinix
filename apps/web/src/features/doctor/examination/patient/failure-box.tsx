import { ErrorState } from '../../../../shared/ui/error-state';
import { isNotFoundError, PATIENT_TEXT } from './patient-exam-text';

// Hộp lỗi của trang "Hồ sơ khám bệnh" (doctor-exam F5; WXH-06). Câu theo LOẠI lỗi (`errorMessageFor` của `shared`: mất mạng, hết giờ, chung) kèm `Thử lại` chạy lại ĐÚNG bước vừa lỗi; phản hồi sai hình dạng
// (`UnexpectedResponseError`) ra câu chung, không vẽ dữ liệu dở dang. Riêng 404 `KHONG_TIM_THAY` của chi tiết: câu riêng KHÔNG có `Thử lại` (thử lại không đổi được kết quả); cùng kiểu hộp với `ErrorState` (token `danger-*` của ADR 0004).
export function FailureBox({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  if (!isNotFoundError(error))
    return <ErrorState error={error} onRetry={onRetry} />;
  return (
    <p
      role="alert"
      className="my-2 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
    >
      {PATIENT_TEXT.notFound}
    </p>
  );
}
