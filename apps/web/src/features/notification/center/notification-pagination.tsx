import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CENTER_TEXT } from './notification-text';

// Chuyển trang của danh sách (notification F2; WTB-07). Chỉ hiện khi có từ hai trang. Nút ở biên vô hiệu; vùng bấm cao 38 px (WCAG 2.5.8). Bám `ListPagination` của booking
// (không import chéo feature nên viết lại phần nhỏ này).
export function NotificationPagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const button =
    'inline-flex min-h-[2.4rem] items-center gap-1 rounded-lg border border-gray-500 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <nav
      aria-label={CENTER_TEXT.paginationLabel}
      className="flex items-center justify-end gap-2"
    >
      <span className="text-xs whitespace-nowrap text-gray-600">
        {CENTER_TEXT.pageOf(Math.min(page, pageCount), pageCount)}
      </span>
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.min(page, pageCount) - 1)}
        className={button}
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {CENTER_TEXT.previousPage}
      </button>
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        className={button}
      >
        {CENTER_TEXT.nextPage}
        <ChevronRight aria-hidden="true" className="size-4" />
      </button>
    </nav>
  );
}
