import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CatalogPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function CatalogPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: CatalogPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-text-secondary">
      <p aria-live="polite">
        {start}–{end} / {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Trang trước"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Trước
        </button>
        <span>
          Trang {Math.min(page, pageCount)} / {pageCount}
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Trang sau"
        >
          Sau
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
