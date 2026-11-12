import { ChevronLeft, X } from 'lucide-react';
import { useId, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useModalDialog } from '../../../../../shared/hooks/use-modal-dialog';
import { ErrorState } from '../../../../../shared/ui/error-state';
import { LoadingState } from '../../../../../shared/ui/loading-state';
import {
  formatVietnamShortDate,
  formatVietnamTime,
} from '../../common/appointment-format';
import { classifyDetailError } from '../../common/error-kinds';
import { StatusChip } from '../../common/status-chip';
import { useInertBackground } from '../../common/use-inert-background';
import { DETAIL_TEXT, whenLabel } from './detail-messages';
import { DetailSections } from './detail-sections';
import {
  ReceptionActions,
  type ReceptionActionHandlers,
} from './reception-actions';
import { useReceptionDetail } from './use-reception-detail';

// F9 thay bằng handler thật ở ĐÚNG chỗ này (xem `reception-actions.tsx`): `DaHuy` mở hộp `Hủy lịch hẹn`, `VangMat` mở hộp `Đánh dấu vắng mặt`, `DaTiepDon` gọi tiếp đón.
// Sau thao tác thành công F9 gọi `reload` (chi tiết) và `onReloadList` (danh sách) cho khớp máy chủ. F8 chưa có B12 nên không có handler nào.
const ACTION_HANDLERS: ReceptionActionHandlers = {};

// Lỗi tải chi tiết chọn câu theo `maLoi`, KHÔNG theo mã HTTP: `KHONG_TIM_THAY` là MỘT câu cho mọi lý do (không có, chi nhánh khác, mã sai dạng: cùng thân 404, không lộ lịch có
// tồn tại hay không); phiên hết hạn và không đủ quyền có câu riêng, không `Thử lại`; còn lại (mạng, quá giờ, phản hồi lạ, 5xx, `maLoi` lạ) dùng `ErrorState` kèm `Thử lại`.
function DetailFailure(props: { error: unknown; onRetry: () => void }) {
  const kind = classifyDetailError(props.error);
  const message =
    kind === 'notFound'
      ? DETAIL_TEXT.notFound
      : kind === 'session'
        ? DETAIL_TEXT.sessionExpired
        : kind === 'forbidden'
          ? DETAIL_TEXT.forbidden
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

// Ngăn chi tiết một lịch hẹn của Lễ tân (booking F8; Figma `488:2`: ngăn 420 px bên phải, lớp phủ đen 40%, liên kết `Danh sách`). Là hộp thoại MODAL: `role="dialog"`,
// `aria-modal`, nền `inert` (`useInertBackground`), focus vào `Danh sách` khi mở, Tab bẫy trong ngăn, Esc đóng, trả focus về nút `Chi tiết` của đúng hàng
// (`useModalDialog`). Figma KHÔNG có nút đóng: thêm nút X nhìn thấy được ở đầu ngăn và Esc là `[đề xuất]` cho trợ năng (Đại duyệt 12/11/2026). Chỉ được dựng khi ngăn MỞ
// (nơi gọi quyết định bằng điều kiện và đặt `key` theo mã lịch), nên `open` luôn true. Mã lịch ở đầu ngăn hiện ngay; nội dung hiện sau khi chi tiết về, từ MỘT nguồn là chi
// tiết (không trộn dòng danh sách cũ: trạng thái có thể đã đổi ở nơi khác).
export function ReceptionDrawer(props: {
  maLichHen: string;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  // Làm mới danh sách: khi lịch không còn (404) thì dòng trong bảng đã cũ, nên đóng ngăn kèm tải lại danh sách
  onReloadList: () => void;
}) {
  const { maLichHen, onClose, onReloadList } = props;
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const { view, reload } = useReceptionDetail(maLichHen);

  const stale =
    view.kind === 'error' && classifyDetailError(view.error) === 'notFound';
  const close = () => {
    if (stale) onReloadList();
    onClose();
  };

  // Khai báo TRƯỚC `useModalDialog`: cleanup chạy theo thứ tự khai báo, nên `inert` được gỡ trước khi hook trả focus về nút đã mở (phần tử `inert` không nhận focus)
  useInertBackground(overlayRef);
  useModalDialog({
    open: true,
    dialogRef,
    initialFocusRef: backRef,
    returnFocusRef: props.returnFocusRef,
    onClose: close,
  });

  const ready = view.kind === 'ready' ? view : null;

  return createPortal(
    <div
      ref={overlayRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={ready?.refreshing ?? view.kind === 'loading'}
        className="flex h-full w-full flex-col bg-white shadow-xl sm:max-w-[26.25rem]"
      >
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5">
          <button
            ref={backRef}
            type="button"
            onClick={close}
            className="inline-flex min-h-7 items-center gap-1.5 rounded-lg pr-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            {DETAIL_TEXT.back}
          </button>
          <span className="flex-1" />
          {ready !== null && <StatusChip status={ready.data.trangThai} />}
          <button
            type="button"
            aria-label={DETAIL_TEXT.close}
            onClick={close}
            className="inline-flex size-7 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-50"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h2
            id={titleId}
            className="font-mono text-sm font-bold text-brand-strong"
          >
            <span className="sr-only">{DETAIL_TEXT.dialogPrefix}</span>
            {maLichHen}
          </h2>
          {ready !== null && (
            <p className="text-xs text-gray-600">
              {whenLabel(
                formatVietnamShortDate(ready.data.thoiGian),
                formatVietnamTime(ready.data.thoiGian),
              )}
            </p>
          )}

          {view.kind === 'loading' && (
            <LoadingState message={DETAIL_TEXT.loading} />
          )}
          {view.kind === 'error' && (
            <DetailFailure error={view.error} onRetry={reload} />
          )}
          {ready !== null && (
            <>
              <DetailSections detail={ready.data} />
              <ReceptionActions
                detail={ready.data}
                handlers={ACTION_HANDLERS}
              />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
