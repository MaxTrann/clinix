import type { DataSource, QueryRunner } from 'typeorm';
import { expect, vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import {
  isDeadlockError,
  isLockWaitTimeoutError,
} from '../../database/mysql-errors.js';
import { assertWalletInvariants } from '../../wallet/testing/wallet-invariants.js';
import type { CancelOutcome } from '../cancel/cancel.types.js';
import type { RescheduleOutcome } from '../reschedule/reschedule.types.js';
import { createGate, runRounds } from './concurrency-harness.js';
import {
  reportRounds,
  retryStats,
  sleep,
  winnerTally,
  type ReportOptions,
} from './concurrency-report.js';
import {
  assertBookingInvariants,
  assertRescheduleInvariants,
  type MoneyTotals,
  type Queryable,
} from './invariants.js';
import { raceInOrder } from './lock-wait.js';
import { SWEEP_OFFSETS_MS } from './override-race.js';

// Bộ kiểm và đếm DÙNG CHUNG của bộ ca đồng thời X2 của đổi lịch (reschedule X2; PLAN reschedule 5.4, 7.5; TRACKING reschedule 1.17): sáu int-spec `reschedule-race.*` cùng cần, nên MỘT chỗ ở đây (jscpd quét cả `*.int-spec.ts`).
// Ba việc: (1) `settle`: INV-1 đến INV-10 và IVT-01 đến IVT-07 SAU MỖI VÒNG; (2) `sideOf` và `RaceStats`: đếm 1213, 1205 NỔI ra khỏi `withBookingTransaction` và 503 `HE_THONG_DANG_BAN`; (3) `raceX2`: khung vòng đua HAI BÊN (xen kẽ
// bên đi trước, rồi quét độ lệch cố định) dựng trên `runRounds` và `SWEEP_OFFSETS_MS` của override B14, nhưng cho phép chọn SỐ VÒNG (TDL-04 chạy 100). Số lần THỬ LẠI của `withBookingTransaction` đếm bằng `retryStats` (log Nest) như mọi ca B9.

/** Mã lỗi 503 khi `withBookingTransaction` hết lượt thử lại (không có hằng xuất ra ngoài). */
export const BUSY_CODE = 'HE_THONG_DANG_BAN';

/** Số đo của MỘT ca (một test): số vòng đã qua `settle` và các lỗi MySQL nổi ra khỏi dịch vụ (dịch vụ dựng tay không thử lại). */
export class RaceStats {
  settled = 0;
  surfaced1213 = 0;
  surfaced1205 = 0;
  busy503 = 0;
}

/** Kết quả CHUẨN HOÁ của một bên: `ok` là thành công nghiệp vụ, `code` là `OK` hay mã từ chối (mã lỗi API, `failure.kind` hay mã MySQL). */
export interface Side {
  ok: boolean;
  code: string;
}

export const OK_SIDE: Side = { ok: true, code: 'OK' };

/**
 * Chạy `work`, đổi kết quả sang `Side` bằng `map`; lỗi nghiệp vụ (`AppException`), 1213 và 1205 nổi ra được ĐẾM và đổi thành `Side` từ chối; mọi lỗi khác ném lại (vòng đó đỏ: "lỗi lạ", sẽ là 500 ở HTTP).
 * Dịch vụ qua `withBookingTransaction` thử lại 1213 và 1205 rồi mới ném 503, nên 1213 nổi ra chỉ xảy ra ở dịch vụ dựng tay không thử lại (ví dụ `applyOne`).
 */
export async function sideOf<T>(
  stats: RaceStats,
  work: Promise<T>,
  map: (value: T) => Side = () => OK_SIDE,
): Promise<Side> {
  try {
    return map(await work);
  } catch (error) {
    if (error instanceof AppException) {
      if (error.maLoi === BUSY_CODE) stats.busy503 += 1;
      return { ok: false, code: error.maLoi };
    }
    if (isDeadlockError(error)) {
      stats.surfaced1213 += 1;
      return { ok: false, code: 'MYSQL_1213' };
    }
    if (isLockWaitTimeoutError(error)) {
      stats.surfaced1205 += 1;
      return { ok: false, code: 'MYSQL_1205' };
    }
    throw error;
  }
}

/** Kết quả có kiểu của lõi đổi lịch ⇒ `Side` (từ chối: mã của luật, hay `failure.kind` khi không có mã). */
export function rescheduleSide(outcome: RescheduleOutcome): Side {
  if (outcome.kind === 'Rescheduled') return OK_SIDE;
  if (outcome.kind === 'Rejected') {
    const failure = outcome.failure;
    return {
      ok: false,
      code: failure.kind === 'Rule' ? failure.code : failure.kind,
    };
  }
  return { ok: false, code: outcome.kind };
}

/** Kết quả có kiểu của huỷ lịch ⇒ `Side` (`NotCancellable` kèm trạng thái thật). */
export function cancelSide(outcome: CancelOutcome): Side {
  switch (outcome.kind) {
    case 'Cancelled':
      return OK_SIDE;
    case 'NotCancellable':
      return { ok: false, code: `NotCancellable:${outcome.trangThai}` };
    default:
      return { ok: false, code: outcome.kind };
  }
}

export interface SettleOptions {
  /** Ảnh chụp ba bảng tiền TRƯỚC ca: có thì khẳng định INV-10 (ca KHÔNG có hoàn tiền, thu tiền hay ghi thanh toán 0đ của `create`) */
  moneyBefore?: MoneyTotals;
  /** IVT-07 phần "đủ cọc": mọi lịch cọc > 0 dựng bằng `raceWorld` đều có khoản ví thật nên bật được */
  requireDepositCovered?: boolean;
}

/** INV-1 đến INV-6 (booking), INV-7 đến INV-9 (và INV-10 khi có `moneyBefore`), IVT-01 đến IVT-07 (sổ ví). Ném lỗi nêu bất biến nào vỡ. */
export async function settle(
  db: Queryable,
  options: SettleOptions = {},
): Promise<void> {
  await assertBookingInvariants(db);
  await assertRescheduleInvariants(
    db,
    options.moneyBefore === undefined
      ? {}
      : { moneyBefore: options.moneyBefore },
  );
  await assertWalletInvariants(
    db,
    options.requireDepositCovered === true
      ? { requireDepositCovered: true }
      : {},
  );
}

/** `settle` rồi ghi nhận một vòng đã xanh. */
export async function settleRound(
  db: Queryable,
  stats: RaceStats,
  options: SettleOptions = {},
): Promise<void> {
  await settle(db, options);
  stats.settled += 1;
}

export interface FinishOptions extends ReportOptions {
  /** Cho phép 1213 và 1205 nổi ra (ca đối chứng và ca của `applyOne`); mặc định khẳng định 0 */
  surfacedAllowed?: boolean;
}

/**
 * In MỘT dòng số liệu của ca (`[X2-<tag>]`: số vòng đã qua INV và IVT, 1213 và 1205 nổi, 503 theo mã) rồi khẳng định: mọi vòng đều qua `settle`, 0 lần 503, 0 lần 1213 và 1205 nổi (trừ `surfacedAllowed`). Số thử lại của
 * `withBookingTransaction` và 503 do hết lượt in ở dòng của `reportRounds` (cùng `tag`); `options.retriesAllowed` cho ca có đối tác đi theo `khung_gio ⇒ lich_hen ⇒ UPDATE trạng thái` (B12 Q).
 */
export function finishX2(
  tag: string,
  name: string,
  rounds: number,
  winners: Record<string, number>,
  logs: readonly string[],
  stats: RaceStats,
  options: FinishOptions = {},
): void {
  console.info(
    `[X2-${tag}] ${name}: INV-1…INV-10 và IVT-01…IVT-07 xanh ở ${String(stats.settled)}/${String(rounds)} vòng; 1213 nổi ${String(stats.surfaced1213)}; 1205 nổi ${String(stats.surfaced1205)}; 503 theo mã ${String(stats.busy503)}`,
  );
  reportRounds(`X2-${tag}`, name, rounds, winners, logs, options);
  expect(stats.settled, `${name}: số vòng đã qua settle`).toBe(rounds);
  expect(stats.busy503, `${name}: 503 HE_THONG_DANG_BAN`).toBe(0);
  if (options.surfacedAllowed !== true) {
    expect(stats.surfaced1213, `${name}: 1213 nổi ra`).toBe(0);
    expect(stats.surfaced1205, `${name}: 1205 nổi ra`).toBe(0);
  }
}

/** Tổng số lần thử lại 1213 và 1205 của `withBookingTransaction` (từ log Nest của test), để ghi vào TRACKING. */
export function totalRetries(logs: readonly string[]): number {
  return Object.values(retryStats(logs).retries).reduce((sum, n) => sum + n, 0);
}

/** Số vòng mặc định của ca đôi: 40 vòng xen kẽ + 2 vòng cho mỗi độ lệch của bản quét (= 56, như `TOTAL_ROUNDS` của override B14). */
export const PAIR_ROUNDS = 40 + SWEEP_OFFSETS_MS.length * 2;
/** Độ lệch (ms) của bên đi sau ở các vòng xen kẽ. */
const ALTERNATING_LAG_MS = 4;

/** Độ trễ (ms) của bên thứ nhất và bên thứ hai ở vòng `round` (đếm từ 1) trong tổng `rounds` vòng; hàm thuần để kiểm kịch bản mà không cần đợi. */
export function pairLags(round: number, rounds: number): [number, number] {
  const alternating = rounds - SWEEP_OFFSETS_MS.length * 2;
  if (round <= alternating)
    return round % 2 === 0 ? [ALTERNATING_LAG_MS, 0] : [0, ALTERNATING_LAG_MS];
  const index = round - alternating - 1;
  const offset = SWEEP_OFFSETS_MS[Math.floor(index / 2)] ?? 0;
  return index % 2 === 0 ? [offset, 0] : [0, offset];
}

/**
 * Hai việc xuất phát CÙNG LÚC qua MỘT cổng. Vòng xen kẽ (`round <= rounds - 16`): vòng lẻ bên thứ hai chậm 4 ms, vòng chẵn bên thứ nhất chậm 4 ms. Vòng quét (16 vòng cuối): với mỗi độ lệch của
 * `SWEEP_OFFSETS_MS` hai vòng, một vòng bên thứ nhất chậm đúng chừng đó và một vòng bên thứ hai. Dãy độ lệch CỐ ĐỊNH, không ngẫu nhiên: cùng số vòng thì cùng kịch bản.
 */
export function pairThunks<A, B>(
  round: number,
  rounds: number,
  first: () => Promise<A>,
  second: () => Promise<B>,
) {
  const [firstLag, secondLag] = pairLags(round, rounds);
  const gate = createGate(2);
  return [
    async (): Promise<A | B> => {
      await gate.arrive();
      if (firstLag > 0) await sleep(firstLag);
      return first();
    },
    async (): Promise<A | B> => {
      await gate.arrive();
      if (secondLag > 0) await sleep(secondLag);
      return second();
    },
  ] as const;
}

type RacedPair = [PromiseSettledResult<Side>, PromiseSettledResult<Side>];
type Raced = Side | RacedPair;

export interface RaceSpec<C> {
  /** Nhãn dòng số liệu, ví dụ `TDL-01` (in là `[X2-TDL-01]`) */
  tag: string;
  name: string;
  db: DataSource;
  logs: readonly string[];
  stats: RaceStats;
  /** Số vòng; mặc định `PAIR_ROUNDS` (56) */
  rounds?: number;
  /**
   * CA CỔNG XÁC ĐỊNH (thay cho quét độ lệch): một kết nối riêng giữ khoá `lock` (câu `FOR UPDATE`), `first` bắt đầu và, khi đã bị chặn ở `lock.table`, `second` mới bắt đầu, rồi nhả khoá: InnoDB cấp theo thứ tự hàng đợi
   * nên `first` đi trước `second` (`raceInOrder`). Không phụ thuộc thời gian; chọn bảng mà CẢ HAI bên cùng bị chặn.
   */
  gate?: (context: C) => { sql: string; params: unknown[]; table: string };
  /** Dữ liệu SẠCH của vòng; có thể trả thêm `moneyBefore` cho INV-10 */
  setup: (round: number) => Promise<C>;
  first: (context: C) => Promise<Side>;
  second: (context: C) => Promise<Side>;
  /** Kiểm kết quả của vòng và ghi bên thắng bằng `tally.add` (INV và IVT do `settleRound` chạy SAU hàm này) */
  check: (
    context: C,
    first: Side,
    second: Side,
    tally: ReturnType<typeof winnerTally>,
  ) => Promise<void>;
  /** Tuỳ chọn của `settle` cho vòng, biết cả kết quả hai bên (ví dụ chỉ so tiền ở vòng KHÔNG có hoàn tiền); mặc định: không so tiền */
  settleOptions?: (context: C, first: Side, second: Side) => SettleOptions;
  options?: FinishOptions;
}

/** Chạy `rounds` vòng đua HAI BÊN, `check` rồi `settleRound` SAU MỖI VÒNG, rồi `finishX2` in số liệu và khẳng định. Trả bảng bên thắng. */
export async function raceX2<C>(
  spec: RaceSpec<C>,
): Promise<Record<string, number>> {
  const rounds = spec.rounds ?? PAIR_ROUNDS;
  const tally = winnerTally();
  await runRounds<C, Raced>({
    rounds,
    setup: spec.setup,
    race: (context, round) =>
      spec.gate === undefined
        ? pairThunks(
            round,
            rounds,
            () => spec.first(context),
            () => spec.second(context),
          )
        : [
            () =>
              raceInOrder(
                spec.db,
                (spec.gate as NonNullable<typeof spec.gate>)(context),
                () => spec.first(context),
                () => spec.second(context),
              ),
          ],
    check: async (context, results) => {
      const settledPair: readonly PromiseSettledResult<Raced>[] =
        spec.gate === undefined
          ? results
          : ((results[0] as PromiseFulfilledResult<RacedPair>)
              .value as RacedPair);
      const [first, second] = settledPair.map((result) => {
        if (result.status === 'rejected') throw result.reason;
        return result.value;
      }) as [Side, Side];
      await spec.check(context, first, second, tally);
      await settleRound(
        spec.db,
        spec.stats,
        spec.settleOptions?.(context, first, second) ?? {},
      );
    },
  });
  finishX2(
    spec.tag,
    spec.name,
    rounds,
    tally.winners,
    spec.logs,
    spec.stats,
    spec.options,
  );
  return tally.winners;
}

/** Một câu `khung_gio … FOR UPDATE` đã chạy: `tx` là số thứ tự của giao dịch (một `QueryRunner`), `slotId` là id khung giờ khoá. */
export interface SlotLockRecord {
  tx: number;
  slotId: string;
}

// Câu của `lockSlot` (slots/slot-lock.ts): MỘT bảng, khoá chính, `FOR UPDATE`.
const SLOT_LOCK_SQL = /FROM khung_gio WHERE khung_gio_id = \?\s+FOR UPDATE/;

/**
 * Ghi mỗi câu khoá `khung_gio` theo TỪNG GIAO DỊCH (mỗi `QueryRunner` một số `tx`), và (nếu `delayMs > 0`) giữ lại `delayMs` ms SAU mỗi câu đó để hai bên chắc chắn gặp nhau GIỮA hai khoá
 * (nếp B4 DLH-34 và X1 M1: không có độ trễ này đột biến "khoá cũ rồi mới" sống sót vì cửa sổ giữa hai khoá chỉ một câu truy vấn). CHỈ gọi MỘT lần mỗi test (thay `createQueryRunner` bằng `vi.spyOn`;
 * không dùng cùng `interceptStatements` hay `recordStatements`); `useIntegrationHooks` tự gỡ sau mỗi test. Dùng cho TDL-03 (độ trễ) và TDL-19 (thứ tự theo SỐ: 9 rồi 10).
 */
export function watchSlotLocks(db: DataSource, delayMs = 0) {
  const locks: SlotLockRecord[] = [];
  let transactions = 0;
  const create = db.createQueryRunner.bind(db);
  vi.spyOn(db, 'createQueryRunner').mockImplementation((...args) => {
    const runner: QueryRunner = create(...args);
    transactions += 1;
    const tx = transactions;
    const run = runner.query.bind(runner) as (
      sql: string,
      params?: unknown[],
      structured?: boolean,
    ) => Promise<unknown>;
    runner.query = (async (
      sql: string,
      params?: unknown[],
      structured?: boolean,
    ) => {
      const result = await run(sql, params, structured);
      if (SLOT_LOCK_SQL.test(sql)) {
        locks.push({ tx, slotId: String(params?.[0]) });
        if (delayMs > 0) await sleep(delayMs);
      }
      return result;
    }) as unknown as QueryRunner['query'];
    return runner;
  });
  return {
    locks,
    clear: () => {
      locks.length = 0;
    },
  };
}

/**
 * Với mỗi giao dịch đã khoá từ hai khung giờ KHÁC NHAU trở lên: hai id đầu tiên (theo thứ tự khoá, bỏ lần xin lại hàng đã giữ) phải TĂNG theo SỐ (BigInt). Trả các giao dịch vi phạm kèm dãy id thật,
 * và số giao dịch đã kiểm (để khẳng định ca không kiểm trống rỗng).
 */
export function slotLockOrder(locks: readonly SlotLockRecord[]): {
  checked: number;
  violations: { tx: number; order: string[] }[];
} {
  const byTx = new Map<number, string[]>();
  for (const { tx, slotId } of locks) {
    const seen = byTx.get(tx) ?? [];
    if (!seen.includes(slotId)) seen.push(slotId);
    byTx.set(tx, seen);
  }
  let checked = 0;
  const violations: { tx: number; order: string[] }[] = [];
  for (const [tx, order] of byTx) {
    const [first, second] = order;
    if (first === undefined || second === undefined) continue;
    checked += 1;
    if (BigInt(first) >= BigInt(second)) violations.push({ tx, order });
  }
  return { checked, violations };
}

/** Bộ sinh số giả ngẫu nhiên có HẠT GIỐNG (mulberry32): cùng hạt giống thì cùng dãy, để TDL-17 tái hiện được. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rút `count` phần tử KHÁC NHAU từ `items` (xáo Fisher–Yates theo bộ sinh có hạt giống). */
export function pickDistinct<T>(
  random: () => number,
  items: readonly T[],
  count: number,
): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j] as T, pool[i] as T];
  }
  return pool.slice(0, Math.min(count, pool.length));
}
