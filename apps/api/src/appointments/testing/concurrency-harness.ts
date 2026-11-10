import type { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import {
  isDeadlockError,
  isLockWaitTimeoutError,
} from '../../database/mysql-errors.js';
import {
  createGate,
  runConcurrently,
  summarize,
} from '../../doctor/testing/concurrency-harness.js';

// Công cụ chạy đua cho DT, KT và X1 của booking (PLAN booking 5.15, 7.10; TRACKING 3.6 P2-G). TÁI DÙNG ba hàm của doctor (chính chúng tái dùng `runConcurrently` của
// admin) bằng re-export, không chép; chỉ thêm ba thứ còn thiếu mà mọi ca đồng thời của booking cần. jscpd quét file `testing/`, nên vòng lặp "N vòng, mỗi vòng dựng dữ liệu
// mới, chạy đua, kiểm" nằm MỘT chỗ ở đây thay vì chép ở từng DT.
export { createGate, runConcurrently, summarize };

/**
 * Chạy `rounds` vòng: mỗi vòng `setup` dựng dữ liệu MỚI, `race` trả danh sách việc chạy đua (chúng nên dùng `createGate` để chắc chắn chồng lên nhau), rồi `check` kiểm
 * (thường gọi `assertBookingInvariants`). Lỗi ở bất kỳ bước nào nêu SỐ VÒNG và giữ lỗi gốc ở `cause`. Trả kết quả thô của mọi vòng để gộp bằng `tallyOutcomes`
 * (tỉ lệ 1213/1205 cho M1). Tuần tự giữa các vòng, song song trong vòng.
 */
export async function runRounds<Context, T>(input: {
  rounds: number;
  setup: (round: number) => Promise<Context>;
  race: (context: Context, round: number) => readonly (() => Promise<T>)[];
  check: (
    context: Context,
    results: PromiseSettledResult<T>[],
    round: number,
  ) => void | Promise<void>;
}): Promise<PromiseSettledResult<T>[][]> {
  const all: PromiseSettledResult<T>[][] = [];
  for (let round = 1; round <= input.rounds; round += 1) {
    try {
      const context = await input.setup(round);
      const results = await runConcurrently(input.race(context, round));
      await input.check(context, results, round);
      all.push(results);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Vòng ${round}/${input.rounds}: ${reason}`, {
        cause: error,
      });
    }
  }
  return all;
}

export interface Tally {
  total: number;
  /** Việc chạy xong (kể cả trả kết quả "từ chối" có kiểu: đó là giá trị, không phải lỗi) */
  ok: number;
  /** Lỗi `AppException` đếm theo `maLoi` (kể cả 503 `HE_THONG_DANG_BAN`) */
  byCode: Record<string, number>;
  /** 1213: deadlock còn sót sau khi `withBookingTransaction` đã thử lại */
  deadlocks: number;
  /** 1205: hết thời gian chờ khoá */
  lockTimeouts: number;
  /** Mọi lỗi còn lại: lỗi lạ, sẽ thành 500 ở HTTP ("không 500" ⇒ mảng rỗng) */
  other: unknown[];
}

/** Gộp kết quả `runConcurrently` thành số đếm: thành công, theo mã lỗi nghiệp vụ, 1213, 1205 và lỗi lạ. */
export function tallyOutcomes(
  results: readonly PromiseSettledResult<unknown>[],
): Tally {
  const tally: Tally = {
    total: results.length,
    ok: 0,
    byCode: {},
    deadlocks: 0,
    lockTimeouts: 0,
    other: [],
  };
  for (const result of results) {
    if (result.status === 'fulfilled') tally.ok += 1;
    else if (result.reason instanceof AppException)
      tally.byCode[result.reason.maLoi] =
        (tally.byCode[result.reason.maLoi] ?? 0) + 1;
    else if (isDeadlockError(result.reason)) tally.deadlocks += 1;
    else if (isLockWaitTimeoutError(result.reason)) tally.lockTimeouts += 1;
    else tally.other.push(result.reason);
  }
  return tally;
}

export interface RowLock {
  /** Giao dịch đang giữ khoá: làm thêm việc BÊN TRONG nó (ví dụ `UPDATE`) rồi `release('commit')`. */
  manager: EntityManager;
  /** Nhả khoá bằng cách hoàn tác (mặc định) hay commit; gọi lần hai không làm gì. */
  release: (outcome?: 'commit' | 'rollback') => Promise<void>;
}

/**
 * Mở MỘT kết nối riêng, bắt đầu giao dịch (`READ COMMITTED`, như `withBookingTransaction`) và chạy câu khoá `sql` (ví dụ `SELECT … FOR UPDATE`) rồi GIỮ khoá cho tới
 * `release()`. Dùng cho KT-03 ("giao dịch giả giữ `benh_nhan`"), DT-09 ("cổng giả khoá `bac_si` `FOR UPDATE`"), DT-12 và M3. Câu khoá lỗi thì nhả luôn rồi ném lại.
 * Nên gọi qua `withRowLock` để ca đỏ không để lại giao dịch mở.
 */
export async function holdRowLock(
  db: DataSource,
  sql: string,
  params: unknown[] = [],
): Promise<RowLock> {
  const runner: QueryRunner = db.createQueryRunner();
  let released = false;
  const release = async (outcome: 'commit' | 'rollback' = 'rollback') => {
    if (released) return;
    released = true;
    try {
      if (outcome === 'commit') await runner.commitTransaction();
      else await runner.rollbackTransaction();
    } finally {
      await runner.release();
    }
  };
  try {
    await runner.connect();
    await runner.startTransaction('READ COMMITTED');
    await runner.query(sql, params);
  } catch (error) {
    // nhả kết nối nhưng giữ lỗi GỐC (nhả có thể lỗi phụ, ví dụ chưa kịp bắt đầu giao dịch)
    await release('rollback').catch(() => undefined);
    throw error;
  }
  return { manager: runner.manager, release };
}

/** `holdRowLock` + `finally`: chạy `work` trong lúc khoá đang bị giữ; xong (hay lỗi) thì nhả bằng hoàn tác (muốn commit thì `release('commit')` trong `work`). */
export async function withRowLock<T>(
  db: DataSource,
  lock: { sql: string; params?: unknown[] },
  work: (held: RowLock) => Promise<T>,
): Promise<T> {
  const held = await holdRowLock(db, lock.sql, lock.params);
  try {
    return await work(held);
  } finally {
    await held.release('rollback');
  }
}
