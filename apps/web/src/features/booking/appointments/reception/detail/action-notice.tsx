import type { RefObject } from 'react';
import { refundResultLine } from '../../common/refund-text';
import type { StatusChangeResult } from '../api/reception-appointment-types';
import { ACTION_TEXT } from './detail-messages';
import type { StatusActionState } from './use-status-action';

// Vùng thông báo kết quả trong ngăn chi tiết (booking F9; TRACKING 3.30 F9-H, F9-I). Hiện SAU khi hộp đã đóng (thành công) hay khi `Tiếp đón` (gọi thẳng, không có hộp) lỗi.
// Nằm NGOÀI nhóm nút vì nhóm nút biến mất khi lịch đổi trạng thái (`chuyenDuoc[]` mới). Tiêu điểm vào đây khi có kết quả: nút vừa bấm có thể đã không còn.
//  - done      `role="status"`: "Đã hủy lịch hẹn." kèm số hoàn THỰC TẾ (chuỗi của máy chủ, không tính ở client), "Đã ghi nhận vắng mặt.", "Đã tiếp đón bệnh nhân.".
//  - failed, stopped  `role="alert"`: câu theo `maLoi`; kết quả chưa rõ thì thêm `Tải lại chi tiết`.
const SUCCESS_TEXT = {
  DaHuy: ACTION_TEXT.cancel.done,
  VangMat: ACTION_TEXT.noShow.done,
  DaTiepDon: ACTION_TEXT.checkIn.done,
} as const;

function SuccessLines({ result }: { result: StatusChangeResult }) {
  return (
    <>
      <p className="font-medium">{SUCCESS_TEXT[result.trangThai]}</p>
      {result.trangThai === 'DaHuy' && (
        <p className="pt-1">{refundResultLine(result.hoanCoc)}</p>
      )}
    </>
  );
}

export function ActionNotice({
  state,
  noticeRef,
  onReload,
}: {
  state: StatusActionState;
  noticeRef: RefObject<HTMLDivElement | null>;
  onReload: () => void;
}) {
  if (state.kind === 'done') {
    return (
      <div
        ref={noticeRef}
        tabIndex={-1}
        role="status"
        className="mt-4 rounded-xl border border-success-line bg-success-soft px-3 py-2 text-sm text-success"
      >
        <SuccessLines result={state.result} />
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
            {ACTION_TEXT.reload}
          </button>
        )}
      </div>
    );
  }
  return null;
}
