import type { ReactNode } from 'react';
import styles from './admin-components.module.css';

export interface AdminTableColumn<Row> {
  id: string;
  header: string;
  // Độ rộng cột theo Figma (vd '22%'); có ít nhất một cột đặt thì bảng chia cột cố định
  width?: string;
  cell: (row: Row) => ReactNode;
}

interface AdminTableProps<Row> {
  label: string;
  columns: AdminTableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  emptyMessage?: string;
}

export function AdminTable<Row>({
  label,
  columns,
  rows,
  getRowKey,
  page,
  pageSize,
  total,
  onPageChange,
  emptyMessage = 'Chưa có dữ liệu.',
}: AdminTableProps<Row>) {
  const safeTotal = Math.max(0, total);
  const safePageSize = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const firstItem = safeTotal === 0 ? 0 : (safePage - 1) * safePageSize + 1;
  const lastItem = Math.min(safePage * safePageSize, safeTotal);

  return (
    <section className={styles.tableSection}>
      <div className={styles.tableScroll}>
        <table
          className={`${styles.table} ${columns.some((column) => column.width) ? styles.fixedTable : ''}`}
          aria-label={label}
        >
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.id} scope="col" style={{ width: column.width }}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className={styles.emptyCell} colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={getRowKey(row)}>
                  {columns.map((column) => (
                    <td key={column.id}>{column.cell(row)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.pagination}>
        <p aria-live="polite">
          {firstItem}–{lastItem} / {total}
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
    </section>
  );
}
