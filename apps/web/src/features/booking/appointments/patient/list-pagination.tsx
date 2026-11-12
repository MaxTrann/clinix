import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LIST_TEXT, pageLabel } from './list-messages';

interface ListPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

// Chuyển trang của "Lịch hẹn của tôi" (Figma `411:2` không có phân trang: [đề xuất], như Q31). Chỉ hiện khi có từ hai trang trở lên. Vùng bấm cao 38 px
// (WCAG 2.2 mục 2.5.8 cần tối thiểu 24 × 24); nút vô hiệu ở biên.
export function ListPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: ListPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (pageCount <= 1) return null;
  const current = Math.min(page, pageCount);

  const steps = [
    {
      key: 'previous',
      text: LIST_TEXT.previous,
      name: LIST_TEXT.previousPage,
      Icon: ChevronLeft,
      target: current - 1,
      disabled: current <= 1,
    },
    {
      key: 'next',
      text: LIST_TEXT.next,
      name: LIST_TEXT.nextPage,
      Icon: ChevronRight,
      target: current + 1,
      disabled: current >= pageCount,
    },
  ] as const;

  return (
    <nav
      aria-label={LIST_TEXT.paginationLabel}
      className="mt-3 flex items-center justify-end gap-2"
    >
      <span className="text-xs whitespace-nowrap text-gray-600">
        {pageLabel(current, pageCount)}
      </span>
      {steps.map(({ key, text, name, Icon, target, disabled }) => (
        <button
          key={key}
          type="button"
          aria-label={name}
          disabled={disabled}
          onClick={() => onPageChange(target)}
          className="inline-flex min-h-[2.4rem] items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
        >
          {key === 'next' && text}
          <Icon aria-hidden="true" className="size-4" />
          {key === 'previous' && text}
        </button>
      ))}
    </nav>
  );
}
