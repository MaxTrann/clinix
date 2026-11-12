import type { EntityManager } from 'typeorm';

// `EntityManager` GIẢ chỉ có `query`, lập trình được theo câu SQL (task B11; TRACKING 3.24.3): cho test ĐƠN VỊ của các hàm họ B (`confirmPaid`, `complete`) và các hàm đọc của `queries/`, vốn chỉ nhận
// `em` và chỉ gọi `em.query`. Ghi lại mọi câu (SQL và tham số) theo thứ tự gọi, cho phép bơm lỗi theo câu. Không DB, không giao dịch: ca MySQL thật nằm ở `*.int-spec.ts`.

export interface RecordedQuery {
  sql: string;
  params: unknown[];
}

export class ScriptedEntityManager {
  readonly queries: RecordedQuery[] = [];
  /** Bơm lỗi: trả lỗi cần ném cho câu này, hoặc `undefined` để chạy bình thường */
  failQuery: (sql: string) => unknown = () => undefined;

  constructor(
    private readonly answer: (sql: string, params: unknown[]) => unknown,
  ) {}

  query = (sql: string, params: unknown[] = []): Promise<unknown> => {
    this.queries.push({ sql, params });
    const failure = this.failQuery(sql);
    if (failure !== undefined) return Promise.reject(failure as Error);
    return Promise.resolve(this.answer(sql, params));
  };

  get em(): EntityManager {
    return this as unknown as EntityManager;
  }

  /** Mỗi câu rút gọn thành nhãn: `read lich_hen`, `lock lich_hen` (có `FOR UPDATE`), `write lich_hen` (`UPDATE`); tên bảng là bảng đầu tiên sau `FROM` hay `UPDATE`. */
  get labels(): string[] {
    return this.queries.map(({ sql }) => labelOf(sql));
  }
}

export function labelOf(sql: string): string {
  const table = /\b(?:FROM|UPDATE)\s+`?(\w+)`?/i.exec(sql)?.[1] ?? '?';
  if (/^\s*UPDATE\b/i.test(sql)) return `write ${table}`;
  return /\bFOR\s+UPDATE\b/i.test(sql) ? `lock ${table}` : `read ${table}`;
}

/** Lỗi MySQL giả có `errno` và `code` như driver (1213 deadlock, 1205 hết giờ chờ khoá). */
export function mysqlError(errno: 1213 | 1205): Error {
  return Object.assign(new Error('lỗi MySQL giả'), {
    errno,
    code: errno === 1213 ? 'ER_LOCK_DEADLOCK' : 'ER_LOCK_WAIT_TIMEOUT',
  });
}
