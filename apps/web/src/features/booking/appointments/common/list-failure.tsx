import { ErrorState } from '../../../../shared/ui/error-state';
import { classifyListError } from './error-kinds';
import { COMMON_LIST_TEXT } from './list-text';

// Thông báo lỗi có câu riêng theo `maLoi` (phiên hết hạn, không đủ quyền): không có `Thử lại` vì cùng yêu cầu sẽ cùng kết quả (booking F1 viết, chuyển lên
// `common/` ở F8; Lễ tân dùng lại)
export function ListAlert({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="my-2 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
    >
      {message}
    </p>
  );
}

// Lỗi tải danh sách chọn câu theo `maLoi`, KHÔNG theo mã HTTP: phiên hết hạn và không đủ quyền có câu riêng; mọi lỗi khác (mạng, quá giờ, phản hồi lạ, 5xx, `maLoi` lạ)
// dùng câu chung của `ErrorState` kèm `Thử lại`
export function ListFailure(props: { error: unknown; onRetry: () => void }) {
  const kind = classifyListError(props.error);
  if (kind === 'session') {
    return <ListAlert message={COMMON_LIST_TEXT.sessionExpired} />;
  }
  if (kind === 'forbidden') {
    return <ListAlert message={COMMON_LIST_TEXT.forbidden} />;
  }
  return <ErrorState error={props.error} onRetry={props.onRetry} />;
}
