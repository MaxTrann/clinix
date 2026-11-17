import { useEffect, useRef } from 'react';
import { HIDE_TEXT } from './reviews-text';

// Thông báo sau thao tác ở trang Kiểm duyệt đánh giá (doctor-exam F8; WKD-06, WKD-07): hộp ẩn đã đóng và danh sách tải lại nên nút đã bấm có thể không còn (lọc `Hiển thị` làm hàng biến mất), vì vậy tiêu điểm vào thông báo (như "Đã lưu hồ sơ khám." của F3).
// `hidden` là thành công (xanh); `already`, `gone`, `reloaded` là danh sách vừa được tải lại cho khớp máy chủ, KHÔNG phải lỗi nên không đỏ và không `role="alert"`. Mỗi lần đặt thông báo là MỘT đối tượng mới nên tiêu điểm vào lại cả khi hai lần liền cùng loại.
export type ReviewsNoticeKind = 'hidden' | 'already' | 'gone' | 'reloaded';
export interface ReviewsNoticeValue {
  kind: ReviewsNoticeKind;
}

const NOTICE_TEXT: Record<ReviewsNoticeKind, string> = {
  hidden: HIDE_TEXT.hidden,
  already: HIDE_TEXT.already,
  gone: HIDE_TEXT.notFound,
  reloaded: HIDE_TEXT.reloaded,
};

export function ReviewsNotice({ notice }: { notice: ReviewsNoticeValue }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [notice]);
  return (
    <p
      ref={ref}
      role="status"
      tabIndex={-1}
      className={`rounded-xl border px-3 py-2 text-sm ${
        notice.kind === 'hidden'
          ? 'border-success-surface bg-success-soft text-success'
          : 'border-gray-200 bg-gray-50 text-gray-700'
      }`}
    >
      {NOTICE_TEXT[notice.kind]}
    </p>
  );
}
