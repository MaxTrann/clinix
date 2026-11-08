import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface LookupPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

// Phân trang của danh sách tra cứu (patient F8; TRACKING F8-F). Figma không có phân trang (Q22), nên đây là `[đề xuất]`: "Trước", "Sau",
// "Trang X / Y", nút vô hiệu ở biên. Vùng bấm cao 36 px (WCAG 2.2 mục 2.5.8 cần tối thiểu 24 × 24). Cách làm tham khảo
// `features/admin/service-catalog/catalog-pagination.tsx`, KHÔNG import chéo `features/`.
const BUTTON =
  'inline-flex min-h-[2.4rem] items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white';

export function LookupPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: LookupPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const current = Math.min(page, pageCount);

  return (
    <nav aria-label="Phân trang kết quả" className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Trang trước"
        disabled={current <= 1}
        onClick={() => onPageChange(current - 1)}
        className={BUTTON}
      >
        <ChevronLeft aria-hidden="true" className="size-[1rem]" />
        Trước
      </button>
      <span className="text-xs whitespace-nowrap text-gray-600">
        Trang {current} / {pageCount}
      </span>
      <button
        type="button"
        aria-label="Trang sau"
        disabled={current >= pageCount}
        onClick={() => onPageChange(current + 1)}
        className={BUTTON}
      >
        Sau
        <ChevronRight aria-hidden="true" className="size-[1rem]" />
      </button>
    </nav>
  );
}
