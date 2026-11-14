import { ErrorState } from '../../../../shared/ui/error-state';
import { classifyDetailError } from './error-kinds';

// Lỗi tải chi tiết một lịch hẹn của vận hành (booking F8 viết trong `reception/detail/reception-drawer.tsx`, chuyển lên `common/` ở F10: ngăn của Lễ tân và TRANG của Quản trị viên cùng
// dùng; chữ do nơi gọi truyền). Chọn câu theo `maLoi`, KHÔNG theo mã HTTP: `KHONG_TIM_THAY` là MỘT câu cho mọi lý do (không có, chi nhánh khác, mã sai dạng: cùng thân 404, không lộ lịch có tồn
// tại hay không); phiên hết hạn và không đủ quyền có câu riêng, không `Thử lại`; còn lại (mạng, quá giờ, phản hồi lạ, 5xx, `maLoi` lạ) dùng `ErrorState` kèm `Thử lại`.
export interface DetailFailureTexts {
  notFound: string;
  sessionExpired: string;
  forbidden: string;
}

export function DetailFailure(props: {
  error: unknown;
  onRetry: () => void;
  texts: DetailFailureTexts;
}) {
  const kind = classifyDetailError(props.error);
  const message =
    kind === 'notFound'
      ? props.texts.notFound
      : kind === 'session'
        ? props.texts.sessionExpired
        : kind === 'forbidden'
          ? props.texts.forbidden
          : null;
  if (message === null) {
    return <ErrorState error={props.error} onRetry={props.onRetry} />;
  }
  return (
    <p
      role="alert"
      className="my-2 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
    >
      {message}
    </p>
  );
}
