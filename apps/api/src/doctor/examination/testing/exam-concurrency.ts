import {
  createGate,
  holdRowLock,
  runConcurrently,
  runRounds,
  summarize,
  tallyOutcomes,
  withRowLock,
} from '../../../appointments/testing/concurrency-harness.js';
import { assertExamInvariants, type Queryable } from './exam-invariants.js';

// Công cụ chạy đua cho DHK-* của phần khám bệnh (doctor-exam; PLAN 5.15, 7.8). TÁI DÙNG harness của booking (chính nó tái dùng của doctor và admin) bằng re-export, không chép; chỉ thêm
// MỘT thứ: vòng "N vòng, mỗi vòng dựng dữ liệu mới, chạy đua, kiểm, rồi chạy IVK-01…IVK-05" nằm MỘT chỗ (PLAN 7.8: "sau mỗi ca chạy IVK"; jscpd quét `testing/`).
// KHÔNG import `lock-order.ts` (tầng khoá `6b` là việc của P2): ca nào cần ghi lại chuỗi khoá thì dùng `lock-chain.ts` của booking sau P2.
export {
  createGate,
  holdRowLock,
  runConcurrently,
  summarize,
  tallyOutcomes,
  withRowLock,
};

/** Số vòng mỗi ca đồng thời `[đề xuất]` (PLAN 7.8). */
export const EXAM_RACE_ROUNDS = 40;

export interface ExamRoundsInput<Context, T> {
  /** Mặc định `EXAM_RACE_ROUNDS` */
  rounds?: number;
  setup: (round: number) => Promise<Context>;
  race: (context: Context, round: number) => readonly (() => Promise<T>)[];
  /** Kiểm riêng của ca, chạy TRƯỚC bộ bất biến */
  check?: (
    context: Context,
    results: PromiseSettledResult<T>[],
    round: number,
  ) => void | Promise<void>;
}

/**
 * `runRounds` của booking cộng `assertExamInvariants` sau mỗi vòng (sau `check` của ca). Lỗi ở bất kỳ bước nào nêu `Vòng n/N` và giữ lỗi gốc ở `cause`, nên một bất biến vỡ
 * ở vòng nào cũng bị gọi tên. Trả kết quả thô của mọi vòng để gộp bằng `tallyOutcomes`.
 */
export function runExamRounds<Context, T>(
  db: Queryable,
  input: ExamRoundsInput<Context, T>,
): Promise<PromiseSettledResult<T>[][]> {
  return runRounds({
    rounds: input.rounds ?? EXAM_RACE_ROUNDS,
    setup: input.setup,
    race: input.race,
    check: async (context, results, round) => {
      await input.check?.(context, results, round);
      await assertExamInvariants(db);
    },
  });
}
