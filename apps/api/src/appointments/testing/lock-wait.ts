import type { DataSource } from 'typeorm';
import { holdRowLock } from './concurrency-harness.js';

// Đợi giao dịch BỊ CHẶN ở hàng của một bảng, để dựng thứ tự chạy ĐỊNH TRƯỚC cho ca đồng thời (task B11: DT-03, DT-04, CFP-08; TRACKING 3.24.3). CHỈ ĐỌC `performance_schema.data_lock_waits` (nối
// `data_locks` để lọc đúng schema của DB test và đúng bảng: MySQL dùng chung có thể có cửa sổ khác đang chạy test ở schema khác). KHÔNG `SET GLOBAL`, không bật bộ đếm hay công cụ giám sát nào.

const COUNT_WAITING_SQL = `SELECT COUNT(DISTINCT w.REQUESTING_ENGINE_TRANSACTION_ID) AS n
FROM performance_schema.data_lock_waits w
INNER JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID = w.REQUESTING_ENGINE_LOCK_ID
WHERE l.OBJECT_SCHEMA = DATABASE() AND l.OBJECT_NAME = ?`;

/** Số giao dịch đang chờ khoá một hàng của `table` (trong schema của kết nối `db`). */
export async function countWaitingOn(
  db: DataSource,
  table: string,
): Promise<number> {
  const rows: { n: string | number }[] = await db.query(COUNT_WAITING_SQL, [
    table,
  ]);
  return Number(rows[0]?.n ?? 0);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Đợi tới khi ĐÚNG (hoặc hơn) `count` giao dịch bị chặn ở `table`. Quá `timeoutMs` thì ném lỗi nêu số đang chờ: chính nó là bằng chứng "không ai bị chặn" khi giả thuyết về khoá sai.
 * `timeoutMs` mặc định 2500 ms, dưới `innodb_lock_wait_timeout` = 3 giây của `withBookingTransaction`, nên bên bị chặn chưa kịp hết giờ.
 */
export async function waitUntilWaiting(
  db: DataSource,
  table: string,
  count: number,
  timeoutMs = 2500,
): Promise<void> {
  let waiting = 0;
  // `Date.now` là đồng hồ GIẢ của `useIntegrationHooks` (đứng yên ở T0): đếm số lần hỏi (mỗi lần cách 10 ms) thay vì dựa vào đồng hồ
  for (let attempt = 0; attempt * 10 <= timeoutMs; attempt += 1) {
    waiting = await countWaitingOn(db, table);
    if (waiting >= count) return;
    await sleep(10);
  }
  throw new Error(
    `chỉ có ${String(waiting)}/${String(count)} giao dịch bị chặn ở bảng ${table} sau khoảng ${String(timeoutMs)} ms`,
  );
}

/**
 * Chạy hai việc theo THỨ TỰ XIN KHOÁ định trước: một kết nối riêng giữ khoá `sql` (ví dụ `SELECT … FROM khung_gio WHERE khung_gio_id = ? FOR UPDATE`), `first` bắt đầu và (khi đã bị chặn ở
 * `table`) `second` mới bắt đầu, rồi nhả khoá: InnoDB cấp khoá cho người chờ theo thứ tự hàng đợi, nên `first` đi trước `second`. Trả kết quả của cả hai (`allSettled`), không bao giờ bỏ rơi
 * việc đang chờ: lỗi dựng thứ tự (không ai bị chặn) nhả khoá, đợi hai việc xong rồi ném lại lỗi đó.
 */
export async function raceInOrder<T>(
  db: DataSource,
  lock: { sql: string; params: unknown[]; table: string },
  first: () => Promise<T>,
  second: () => Promise<T>,
): Promise<[PromiseSettledResult<T>, PromiseSettledResult<T>]> {
  const held = await holdRowLock(db, lock.sql, lock.params);
  const started: Promise<T>[] = [];
  try {
    started.push(first());
    await waitUntilWaiting(db, lock.table, 1);
    started.push(second());
    await waitUntilWaiting(db, lock.table, 2);
  } catch (error) {
    await held.release('rollback');
    await Promise.allSettled(started);
    throw error;
  }
  await held.release('rollback');
  const [a, b] = await Promise.allSettled(started);
  if (a === undefined || b === undefined)
    throw new Error('thiếu kết quả của một bên');
  return [a, b];
}
