import { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  formatVietnamTime,
  formatVietnamWeekdayDate,
} from '../appointment-format';
import { HandleDialog } from './handle-dialog';
import { listSearchOf } from './request-back';
import { RequestActions } from './request-actions';
import { RequestDetailView } from './request-detail-view';
import { HANDLE_TEXT } from './request-handle-text';
import type { RescheduleRequestHandlers } from './request-handle-types';
import { noticeState } from './request-notice-state';
import type { RescheduleRequestsApi } from './request-types';
import { useHandleRequest } from './use-handle-request';
import { useRequestDetail } from './use-request-detail';

// Trang chi tiết MỘT yêu cầu đổi lịch có thao tác (reschedule F4 Pha B1): ghép `RequestDetailView` (hiển thị) với hai nút Duyệt, Từ chối và hộp ghi chú. KHÔNG biết vai trò: nhận `api` (đọc), `handlers` (ghi) và
// `listPath`; Lễ tân truyền hàm gọi `reception/…`, Quản trị viên ở F5 truyền `admin/…`. Thành công ⇒ về DANH SÁCH ĐÃ MỞ TRƯỚC ĐÓ (`state.listSearch` của liên kết `Chi tiết`, nên đúng tab và bộ lọc) kèm thông báo
// MỘT LẦN. Đang gửi thì không rời trang (rời giữa chừng làm mất kết quả; máy chủ vẫn xử lý). Nút chỉ vẽ khi yêu cầu còn chờ; `coTheDuyet = false` ⇒ "Duyệt" vô hiệu (câu giải thích ở thẻ "Xử lý"), "Từ chối" vẫn dùng được.
export function RequestDetailPage(props: {
  api: RescheduleRequestsApi;
  handlers: RescheduleRequestHandlers;
  yeuCauId: string;
  listPath: string;
}) {
  const { api, handlers, yeuCauId, listPath } = props;
  const location = useLocation();
  const navigate = useNavigate();
  // h1 nhận tiêu điểm khi nút đã mở hộp biến mất (yêu cầu đã xử lý, 404...): chỗ trả tiêu điểm cuối cùng của trang
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { view, reload } = useRequestDetail(api, yeuCauId);
  const ready = view.kind === 'ready' ? view : null;
  const handle = useHandleRequest({
    yeuCauId,
    handlers,
    reload,
    fallbackFocusRef: headingRef,
    onDone: (target) =>
      void navigate(
        { pathname: listPath, search: listSearchOf(location.state) },
        { state: noticeState(target === 'approve' ? 'DaDuyet' : 'TuChoi') },
      ),
  });

  const detail = ready?.data;
  const pending = detail !== undefined && detail.trangThai === 'ChoDuyet';
  const sending = handle.state.kind === 'submitting';

  return (
    <RequestDetailView
      view={view}
      reload={reload}
      listPath={listPath}
      headingRef={headingRef}
      backDisabled={sending}
      onBackClick={(event) => {
        if (handle.isSending()) event.preventDefault();
      }}
      actions={
        pending ? (
          <RequestActions
            canApprove={detail.coTheDuyet}
            busy={sending || (ready?.refreshing ?? false)}
            onApprove={(trigger) => handle.open('approve', trigger)}
            onReject={(trigger) => handle.open('reject', trigger)}
          />
        ) : null
      }
    >
      {/* Hộp đang mở: dựng ở cấp trang, KHÔNG phụ thuộc chi tiết (có thể đang tải lại hay lỗi 404 trong lúc hộp còn hiện câu lỗi) */}
      {handle.dialog !== null && (
        <HandleDialog
          target={handle.dialog.target}
          note={handle.note}
          onNoteChange={handle.setNote}
          state={handle.state}
          panelRef={handle.panelRef}
          onSubmit={handle.send}
          onDismiss={handle.close}
          onReload={handle.reloadAndClose}
          slot={
            handle.dialog.target === 'approve' && detail !== undefined
              ? {
                  label: HANDLE_TEXT.approveSlotLabel,
                  value: `${formatVietnamWeekdayDate(detail.thoiGianMongMuon)}, ${formatVietnamTime(detail.thoiGianMongMuon)}`,
                }
              : undefined
          }
        />
      )}
    </RequestDetailView>
  );
}
