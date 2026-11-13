import type { ReactNode, RefObject } from 'react';
import { COMMON_ACTION_TEXT } from './action-text';
import type { StatusActionState } from './use-status-action';

// Vùng thông báo kết quả của thao tác đổi trạng thái (booking F9 viết ở `reception/detail/action-notice.tsx`, chuyển lên `common/` ở F10: Lễ tân và Quản trị viên cùng dùng; TRACKING 3.30
// F9-H, F9-I). Hiện SAU khi hộp đã đóng (thành công) hay khi một thao tác gọi thẳng không có hộp lỗi. Nằm NGOÀI nhóm nút vì nhóm nút biến mất khi lịch đổi trạng thái (`chuyenDuoc[]`
// mới). Tiêu điểm vào đây khi có kết quả: nút vừa bấm có thể đã không còn. Nội dung thành công do nơi gọi dựng (`renderSuccess`: chữ và số hoàn khác nhau theo trang).
//  - done      `role="status"`.
//  - failed, stopped  `role="alert"`: câu theo `maLoi`; kết quả chưa rõ thì thêm `Tải lại chi tiết`.
export function ActionNotice<R>({
  state,
  noticeRef,
  onReload,
  renderSuccess,
}: {
  state: StatusActionState<R>;
  noticeRef: RefObject<HTMLDivElement | null>;
  onReload: () => void;
  renderSuccess: (result: R) => ReactNode;
}) {
  if (state.kind === 'done') {
    return (
      <div
        ref={noticeRef}
        tabIndex={-1}
        role="status"
        className="mt-4 rounded-xl border border-success-line bg-success-soft px-3 py-2 text-sm text-success"
      >
        {renderSuccess(state.result)}
      </div>
    );
  }
  if (state.kind === 'failed' || state.kind === 'stopped') {
    return (
      <div
        ref={noticeRef}
        tabIndex={-1}
        role="alert"
        className="mt-4 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
      >
        <p>{state.failure.message}</p>
        {state.failure.kind === 'uncertain' && (
          <button
            type="button"
            onClick={onReload}
            className="mt-2 block font-medium underline"
          >
            {COMMON_ACTION_TEXT.reload}
          </button>
        )}
      </div>
    );
  }
  return null;
}
