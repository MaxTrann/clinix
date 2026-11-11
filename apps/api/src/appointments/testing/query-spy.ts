import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';

/**
 * Bọc `em.query` của MỘT giao dịch: mỗi câu đi qua `handler(sql, run)`, `run()` chạy câu thật. Dùng khi test cần xem hay chen vào CHUỖI câu của mã thật (BKR-03 và SLH-08 ghi lại câu để
 * kiểm thứ tự khoá, BKR-10 chen một hành động sau câu đọc đầu tiên). Gắn vào `em` của đúng giao dịch đó, nên không cần dọn (`useIntegrationHooks` gọi `vi.restoreAllMocks`).
 */
export function interceptQuery(
  em: EntityManager,
  handler: (sql: string, run: () => Promise<unknown>) => Promise<unknown>,
): void {
  const original = em.query.bind(em) as (
    sql: string,
    params?: unknown[],
  ) => Promise<unknown>;
  vi.spyOn(em, 'query').mockImplementation(((sql: string, params?: unknown[]) =>
    handler(sql, () => original(sql, params))) as typeof em.query);
}

/** Câu đọc/ghi có mệnh đề khoá hàng (`FOR UPDATE` hoặc `FOR SHARE`). */
export const isLockingStatement = (sql: string): boolean =>
  /\bFOR\s+(?:UPDATE|SHARE)\b/i.test(sql);

/** Tên bảng đầu tiên sau `FROM` của một câu `SELECT`. */
export const firstTableOf = (sql: string): string | undefined =>
  /\bFROM\s+`?(\w+)`?/i.exec(sql)?.[1];
