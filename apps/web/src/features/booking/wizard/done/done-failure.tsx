import { Link } from 'react-router';
import { PATIENT_APPOINTMENTS_PATH } from '../../../../shared/routes/booking-paths';
import { ErrorState } from '../../../../shared/ui/error-state';
import { classifyDetailError } from '../../appointments/common/error-kinds';
import { ListAlert } from '../../appointments/common/list-failure';
import { DONE_TEXT } from './done-messages';

// Lỗi tải lịch hẹn ở Bước 6, chọn câu theo `maLoi` (KHÔNG theo mã HTTP; `classifyDetailError` của F2). `notFound`: MỘT câu cho mọi lý do không xem được (không có, của người
// khác, `DaDoiLich`, mã sai dạng: cùng thân 404) kèm liên kết về "Lịch hẹn của tôi". `session`, `forbidden`: cùng yêu cầu sẽ cùng kết quả nên không `Thử lại`; câu 403 nói về LỊCH HẸN
// (câu của danh sách ở `common/` không hợp ở đây). Còn lại (mạng, quá giờ, phản hồi lạ, 5xx): câu chung của `ErrorState` kèm `Thử lại`.
export function DoneFailure({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  switch (classifyDetailError(error)) {
    case 'notFound':
      return (
        <>
          <ListAlert message={DONE_TEXT.notFound} />
          <Link
            to={PATIENT_APPOINTMENTS_PATH}
            className="inline-flex min-h-11 items-center font-medium text-brand-strong underline"
          >
            {DONE_TEXT.backToList}
          </Link>
        </>
      );
    case 'session':
      return <ListAlert message={DONE_TEXT.sessionExpired} />;
    case 'forbidden':
      return <ListAlert message={DONE_TEXT.forbidden} />;
    default:
      return <ErrorState error={error} onRetry={onRetry} />;
  }
}
