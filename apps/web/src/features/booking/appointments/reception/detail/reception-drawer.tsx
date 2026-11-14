import { ChevronLeft, X } from 'lucide-react';
import { useId, useLayoutEffect, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useModalDialog } from '../../../../../shared/hooks/use-modal-dialog';
import { LoadingState } from '../../../../../shared/ui/loading-state';
import {
  formatVietnamShortDate,
  formatVietnamTime,
} from '../../common/appointment-format';
import { DetailFailure } from '../../common/detail-failure';
import { classifyDetailError } from '../../common/error-kinds';
import { StatusChip } from '../../common/status-chip';
import { useInertBackground } from '../../common/use-inert-background';
import { ActionNotice } from './action-notice';
import { CancelDialog } from './cancel-dialog';
import { DETAIL_TEXT, whenLabel } from './detail-messages';
import { DetailSections } from './detail-sections';
import { NoShowDialog } from './no-show-dialog';
import { ReceptionActions } from './reception-actions';
import { useReceptionActions } from './use-reception-actions';
import { useReceptionDetail } from './use-reception-detail';

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
  const ready = view.kind === 'ready' ? view : null;

  // Ba thao tác ghi của Lễ tân (booking F9): hộp `Hủy lịch hẹn`, hộp `Đánh dấu vắng mặt`, lời gọi `Tiếp đón`; sau thao tác thành công tải lại chi tiết (`reload`) và danh sách
  const actions = useReceptionActions({
    maLichHen,
    patientName: ready?.data.nguoiKham.hoTen ?? '',
    detailRefreshing: ready?.refreshing ?? false,
    reload,
    onReloadList,
    fallbackFocusRef: backRef,
  });
  const submitting = actions.state.kind === 'submitting';

  const stale =
    view.kind === 'error' && classifyDetailError(view.error) === 'notFound';
  // Đang gửi thì không đóng ngăn: đóng giữa chừng làm mất kết quả và danh sách không được tải lại
  const close = () => {
    if (actions.isSending()) return;
    if (stale) onReloadList();
    onClose();
  };

  // Esc đóng đúng MỘT lớp: có hộp thì đóng riêng hộp, không thì đóng ngăn. Ngăn giữ MỘT `useModalDialog` duy nhất (hai hook lồng nhau cùng nghe `keydown` ở `document`
  // nên Esc đóng cả hai lớp và hai bẫy Tab giằng co: TRACKING 3.30 F9-F (2)). `trapRef` là MỘT ref object ổn định (hook có `dialogRef` trong danh sách phụ thuộc của effect,
  // nên đổi danh tính sẽ chạy lại cleanup: trả focus, gỡ khoá cuộn); chỉ gán `.current` theo lớp trên cùng: hộp khi mở, panel ngăn khi không. Hook đọc `dialogRef.current`
  // ở MỖI lần nhấn phím nên bẫy Tab theo lớp trên cùng.
  const requestClose = () => {
    if (actions.dialog !== null) actions.closeDialog();
    else close();
  };
  const trapRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    trapRef.current = actions.dialogPanelRef.current ?? dialogRef.current;
  });

  // Khai báo TRƯỚC `useModalDialog`: cleanup chạy theo thứ tự khai báo, nên `inert` được gỡ trước khi hook trả focus về nút đã mở (phần tử `inert` không nhận focus)
  useInertBackground(overlayRef);
  useModalDialog({
    open: true,
    dialogRef: trapRef,
    initialFocusRef: backRef,
    returnFocusRef: props.returnFocusRef,
    onClose: requestClose,
  });

  // Hộp đang mở (modal thứ hai): dựng ở cấp ngăn, KHÔNG phụ thuộc `ready` (chi tiết có thể đang tải lại hay lỗi 404 trong lúc hộp còn hiện câu lỗi)
  const dialog = actions.dialog;
  const dialogs =
    dialog === null ? null : dialog.target === 'DaHuy' ? (
      <CancelDialog
        state={actions.state}
        panelRef={actions.dialogPanelRef}
        onSubmit={(lyDo) => void actions.submit({ trangThai: 'DaHuy', lyDo })}
        onDismiss={actions.closeDialog}
        onReload={actions.reloadAndClose}
      />
    ) : (
      <NoShowDialog
        patientName={dialog.patientName}
        state={actions.state}
        panelRef={actions.dialogPanelRef}
        onSubmit={() => void actions.submit({ trangThai: 'VangMat' })}
        onDismiss={actions.closeDialog}
        onReload={actions.reloadAndClose}
      />
    );

  const drawer = createPortal(
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
            disabled={submitting}
            onClick={close}
            className="inline-flex min-h-7 items-center gap-1.5 rounded-lg pr-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            {DETAIL_TEXT.back}
          </button>
          <span className="flex-1" />
          {ready !== null && <StatusChip status={ready.data.trangThai} />}
          <button
            type="button"
            aria-label={DETAIL_TEXT.close}
            disabled={submitting}
            onClick={close}
            className="inline-flex size-7 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
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
            <DetailFailure
              error={view.error}
              onRetry={reload}
              texts={DETAIL_TEXT}
            />
          )}
          {ready !== null && (
            <>
              <DetailSections detail={ready.data} />
              {/* Kết quả hay lỗi của thao tác sau khi hộp đã đóng (và của `Tiếp đón`, không có hộp); hộp mở thì lỗi hiện trong hộp */}
              {dialog === null && (
                <ActionNotice
                  state={actions.state}
                  noticeRef={actions.noticeRef}
                  onReload={actions.reloadFromNotice}
                />
              )}
              <ReceptionActions
                detail={ready.data}
                handlers={actions.handlers}
                busy={actions.busy}
                sending={actions.sendingCheckIn}
              />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );

  return (
    <>
      {drawer}
      {dialogs}
    </>
  );
}
