import { useEffect, useRef, type RefObject } from 'react';
import { useRemote } from '../../../../shared/hooks/use-remote';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { ModalFrame } from '../../components/modal-frame';
import type { AdminReviewDetail } from '../api/admin-review-types';
import { getAdminReview } from '../api/exam-api';
import { ReviewDetailBody } from './review-detail-body';
import { DETAIL_TEXT, isReviewNotFound } from './reviews-text';

interface DialogProps {
  danhGiaId: string;
  // Nút `Xem` đã mở hộp: nhận lại tiêu điểm khi đóng
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  // 404 (đánh giá không còn hay ngoài phạm vi): danh sách đang hiện đã lệch máy chủ nên phải tải lại (`onGone` phải ổn định, gọi MỘT lần khi gặp 404)
  onGone: () => void;
  showBranch: boolean;
}

// Hộp "Chi tiết đánh giá" (doctor-exam F7; Figma `570:2` là HỘP GIỮA 480 px, không phải ngăn phải: Đại duyệt 17/11/2026 dùng `ModalFrame` chung của doctor, có nút × và nền `inert`, `Esc`, bẫy tiêu điểm của `useModalDialog`; PLAN gọi "ngăn").
// Chỉ có `Đóng`: nút `Ẩn đánh giá` là của F8 (#414). Chi tiết lấy THEO id (`GET /admin/doctor-ratings/:id`) mỗi lần mở và mỗi khi đổi id nên chi tiết của hàng trước không bao giờ hiện cho hàng sau. Lỗi: 404 ⇒ câu riêng không có `Thử lại` và tải lại danh sách; lỗi khác ⇒ `ErrorState` kèm `Thử lại`.
export function ReviewDetailDialog({
  danhGiaId,
  returnFocusRef,
  onClose,
  onGone,
  showBranch,
}: DialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { state, retry } = useRemote<AdminReviewDetail>(
    (signal) => getAdminReview(danhGiaId, signal),
    [danhGiaId],
  );
  const notFound = state.status === 'error' && isReviewNotFound(state.error);

  useEffect(() => {
    if (notFound) onGone();
  }, [notFound, onGone]);

  return (
    <ModalFrame
      title={DETAIL_TEXT.title}
      initialFocusRef={closeRef}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
      showCloseIcon
      widthClass="max-w-[480px]"
    >
      <div className="overflow-y-auto px-[22.5px] py-[18.75px]">
        {state.status === 'loading' && (
          <LoadingState message={DETAIL_TEXT.loading} />
        )}
        {state.status === 'error' &&
          (notFound ? (
            <p
              role="alert"
              className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
            >
              {DETAIL_TEXT.notFound}
            </p>
          ) : (
            <ErrorState error={state.error} onRetry={retry} />
          ))}
        {state.status === 'ready' && (
          <ReviewDetailBody detail={state.data} showBranch={showBranch} />
        )}
      </div>
      <div className="flex justify-end gap-[7.5px] border-t border-gray-100 px-[22.5px] py-[15px]">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="h-[35.35px] rounded-[13.375px] bg-gray-100 px-[15px] text-[13.125px] font-medium text-gray-700 hover:bg-gray-200"
        >
          {DETAIL_TEXT.close}
        </button>
      </div>
    </ModalFrame>
  );
}
