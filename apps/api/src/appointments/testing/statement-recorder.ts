import type { DataSource, QueryRunner } from 'typeorm';
import { vi } from 'vitest';

// Ghi lại MỌI câu SQL mà các `QueryRunner` do một `DataSource` tạo ra chạy (kể cả câu của repository và `START TRANSACTION`, `COMMIT` của giao dịch), để test kiểm "chỉ đọc": không `FOR UPDATE`,
// `FOR SHARE`, `INSERT`, `UPDATE`, `DELETE` (task B7: BCK-09, BCK-10; B8 dùng lại cho nhánh ghi). Dùng `vi.spyOn`, nên `vi.restoreAllMocks()` (có sẵn trong `useIntegrationHooks`) tự gỡ sau mỗi test.

/** Câu SQL ghi hoặc khoá: không được xuất hiện ở các route chỉ đọc. */
export const WRITE_OR_LOCK_SQL =
  /\b(FOR\s+UPDATE|FOR\s+SHARE|LOCK\s+IN\s+SHARE\s+MODE|INSERT|UPDATE|DELETE|REPLACE)\b/i;

/** Bắt đầu ghi; trả MẢNG đang được điền thêm mỗi khi có câu SQL chạy. */
export function recordStatements(db: DataSource): string[] {
  const seen: string[] = [];
  const create = db.createQueryRunner.bind(db);
  vi.spyOn(db, 'createQueryRunner').mockImplementation((...args) => {
    const runner: QueryRunner = create(...args);
    const run = runner.query.bind(runner) as (
      sql: string,
      params?: unknown[],
      structured?: boolean,
    ) => Promise<unknown>;
    runner.query = ((sql: string, params?: unknown[], structured?: boolean) => {
      seen.push(sql);
      return run(sql, params, structured);
    }) as unknown as QueryRunner['query'];
    return runner;
  });
  return seen;
}
