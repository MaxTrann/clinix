import type { DataSource, QueryRunner } from 'typeorm';
import { vi } from 'vitest';

// Ghi lại MỌI câu SQL mà các `QueryRunner` do một `DataSource` tạo ra chạy (kể cả câu của repository và `START TRANSACTION`, `COMMIT` của giao dịch), để test kiểm "chỉ đọc": không `FOR UPDATE`,
// `FOR SHARE`, `INSERT`, `UPDATE`, `DELETE` (task B7: BCK-09, BCK-10; B8 dùng lại cho nhánh ghi). Dùng `vi.spyOn`, nên `vi.restoreAllMocks()` (có sẵn trong `useIntegrationHooks`) tự gỡ sau mỗi test.

/** Câu SQL ghi hoặc khoá: không được xuất hiện ở các route chỉ đọc. */
export const WRITE_OR_LOCK_SQL =
  /\b(FOR\s+UPDATE|FOR\s+SHARE|LOCK\s+IN\s+SHARE\s+MODE|INSERT|UPDATE|DELETE|REPLACE)\b/i;

/** Một câu SQL của một QueryRunner: nội dung và tham số. */
export interface StatementCall {
  sql: string;
  params: unknown[] | undefined;
}

/**
 * Chen vào MỌI câu của MỌI `QueryRunner` do `db` tạo (kể cả của `db.transaction`): mỗi câu đi qua `handler(call, run)`, `run()` chạy câu thật. Khác `recordStatements` ở chỗ cho phép
 * hành động SAU khi câu đã chạy thật (task B8: DL-27 "mỗi bước cho chạy thật rồi mới ném", TAO-10 ném deadlock giả sau `INSERT lich_hen`). Dùng `vi.spyOn`, nên chỉ gọi MỘT lần mỗi
 * test và KHÔNG dùng cùng `recordStatements` (cả hai thay `createQueryRunner`); `vi.restoreAllMocks()` của `useIntegrationHooks` tự gỡ.
 */
export function interceptStatements(
  db: DataSource,
  handler: (
    call: StatementCall,
    run: () => Promise<unknown>,
  ) => Promise<unknown>,
): void {
  const create = db.createQueryRunner.bind(db);
  vi.spyOn(db, 'createQueryRunner').mockImplementation((...args) => {
    const runner: QueryRunner = create(...args);
    const run = runner.query.bind(runner) as (
      sql: string,
      params?: unknown[],
      structured?: boolean,
    ) => Promise<unknown>;
    runner.query = ((sql: string, params?: unknown[], structured?: boolean) =>
      handler({ sql, params }, () =>
        run(sql, params, structured),
      )) as unknown as QueryRunner['query'];
    return runner;
  });
}

/**
 * Cho câu khớp `pattern` chạy THẬT, rồi ném `error` (tối đa `times` lần đầu): giao dịch đã làm việc rồi mới hỏng. Trả MẢNG các lần khớp (sql và tham số, kể cả lần không ném) để test
 * đối chiếu giữa các lần chạy lại.
 */
export function failAfterStatement(
  db: DataSource,
  pattern: RegExp,
  error: unknown,
  times = 1,
): StatementCall[] {
  const matched: StatementCall[] = [];
  let thrown = 0;
  interceptStatements(db, async (call, run) => {
    const result = await run();
    if (pattern.test(call.sql)) {
      matched.push(call);
      if (thrown < times) {
        thrown += 1;
        throw error;
      }
    }
    return result;
  });
  return matched;
}

/** Bắt đầu ghi; trả MẢNG đang được điền thêm mỗi khi có câu SQL chạy. */
export function recordStatements(db: DataSource): string[] {
  const seen: string[] = [];
  // MỘT chỗ thay `createQueryRunner` (`interceptStatements`): ghi câu NGAY khi được gọi, rồi chạy câu thật
  interceptStatements(db, (call, run) => {
    seen.push(call.sql);
    return run();
  });
  return seen;
}
