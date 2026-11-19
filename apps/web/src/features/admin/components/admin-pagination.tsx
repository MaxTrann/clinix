import { formatRange } from '../../../shared/format/range';
import styles from './admin-components.module.css';

interface AdminPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

// Chân phân trang dùng chung của Admin (AdminTable và hai tab Loại dịch vụ khám). Số liệu được kẹp về miền hợp lệ để trang vượt
// biên (người khác vừa xóa dữ liệu) không in "21–20" hay chia cho 0. Chữ "Hiển thị a–b trên c" [đề xuất]: Figma không vẽ chân trang.
export function AdminPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: AdminPaginationProps) {
  const safeTotal = Math.max(0, total);
  const safePageSize = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const firstItem = safeTotal === 0 ? 0 : (safePage - 1) * safePageSize + 1;
  const lastItem = Math.min(safePage * safePageSize, safeTotal);

  return (
    <div className={styles.pagination}>
      <p aria-live="polite">
        {safeTotal === 0
          ? 'Hiển thị 0 trên 0'
          : `Hiển thị ${formatRange(firstItem, lastItem)} trên ${safeTotal}`}
      </p>
      <div className={styles.paginationButtons}>
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          aria-label="Trang trước"
        >
          Trước
        </button>
        <span>
          Trang {safePage} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= pageCount}
          aria-label="Trang sau"
        >
          Sau
        </button>
      </div>
    </div>
  );
}
