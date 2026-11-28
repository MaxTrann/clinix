import { BUTTON_SECONDARY_CLASS } from './article-public-styles';
import { PUBLIC_TEXT, pageIndicator } from './article-public-text';

// Phân trang của danh sách công khai (PLAN article 5.12): "Trang trước", "Trang n/m", "Trang sau" (nếp `search/doctors/doctor-results.tsx`). Chỉ một trang ⇒ không vẽ.
// `page` là trang ở URL (nguồn duy nhất), `total` và `pageSize` lấy từ máy chủ.
export function ArticlePagination({
  page,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const last = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (last <= 1) return null;
  return (
    <nav
      aria-label={PUBLIC_TEXT.paginationLabel}
      className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm"
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className={BUTTON_SECONDARY_CLASS}
      >
        {PUBLIC_TEXT.prevPage}
      </button>
      <span>{pageIndicator(page, last)}</span>
      <button
        type="button"
        disabled={page >= last}
        onClick={() => onPageChange(page + 1)}
        className={BUTTON_SECONDARY_CLASS}
      >
        {PUBLIC_TEXT.nextPage}
      </button>
    </nav>
  );
}
