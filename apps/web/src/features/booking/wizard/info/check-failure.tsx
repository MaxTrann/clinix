import { Link } from 'react-router';
import { BOOKING_PATH } from '../../../../shared/routes/booking-paths';
import { ListFailure } from '../../appointments/common/list-failure';
import { knownBookingError } from '../../api/booking-errors';
import { BookingNotice } from '../booking-notice';

// Thông báo khi `POST /booking/checks` lỗi (Bước 4; F5 dùng lại cho Bước 5): chọn câu theo `maLoi` ở bảng chung `knownBookingError` (A2, A3, A6, ngừng hồ sơ, A4), KHÔNG
// theo mã HTTP. Lỗi của KHUNG GIỜ có thêm liên kết chọn lại (đổi hồ sơ không cứu được); lỗi đáng thử lại có `Thử lại`. Lỗi không có trong bảng (mạng, quá giờ, 5xx,
// thân lạ, mã lạ, phiên hết hạn) dùng câu chung của `ListFailure` (kèm `Thử lại`, trừ phiên hết hạn và không đủ quyền).
export function CheckFailure({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const known = knownBookingError(error);
  if (known === undefined) {
    return <ListFailure error={error} onRetry={onRetry} />;
  }
  return (
    <BookingNotice message={known.message}>
      {known.retryable && (
        <button
          type="button"
          className="mt-2 block font-medium underline"
          onClick={onRetry}
        >
          Thử lại
        </button>
      )}
      {known.scope === 'slot' && (
        <Link to={BOOKING_PATH} className="mt-2 block font-medium underline">
          Chọn lại dịch vụ
        </Link>
      )}
    </BookingNotice>
  );
}
