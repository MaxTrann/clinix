import type { ReactNode } from 'react';
import styles from './admin-components.module.css';
import { AdminPagination } from './admin-pagination';

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

      <AdminPagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={onPageChange}
      />
    </section>
  );
}
