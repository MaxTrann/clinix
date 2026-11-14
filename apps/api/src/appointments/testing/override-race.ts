import { createGate, runRounds } from './concurrency-harness.js';
import {
  reportRounds,
  sleep,
  valuesOf,
  winnerTally,
  type ReportOptions,
} from './concurrency-report.js';
import { racePair } from './status-int-kit.js';

// Khung vòng đua HAI BÊN của các ca đồng thời của override (task B14; PLAN booking 7.37 `[đề xuất]` OVR-10…OVR-15; TRACKING 3.31 B14-H). THIẾT KẾ SẴN TỪ ĐẦU (ghi trước khi thấy số nào, theo yêu cầu của phiên kiểm 13/11/2026):
//  - `ALTERNATING_ROUNDS` = 40 vòng, hai bên cùng xuất phát (`createGate`), vòng lẻ bên thứ nhất chậm 4 ms, vòng chẵn bên thứ hai (`racePair` của B12): XEN KẼ ai đi trước để CẢ HAI nhánh thắng đều có cơ hội chạy.
//  - Rồi BẢN QUÉT ĐỘ LỆCH: với mỗi độ lệch trong `SWEEP_OFFSETS_MS` (0, 1, 2, 3, 5, 8, 12, 20 ms), hai vòng, một vòng bên thứ nhất bị chậm đúng chừng đó và một vòng bên thứ hai: 16 vòng, để thứ tự khoá bị thử ở nhiều
//    khoảng lệch khác nhau (ngoài một mốc 4 ms cố định), kể cả đồng thời đúng nghĩa (0 ms).
//  - Tổng 56 vòng (≥ 40). Mỗi vòng: dựng dữ liệu SẠCH, chạy hai bên, `check` kiểm kết quả và INV-01…INV-05 (gọi trong `check`), ghi bên thắng; cuối cùng IN một dòng (`reportRounds`: số vòng, bên thắng mỗi vòng, số lần thử lại
//    1213 và 1205 theo nhãn, số yêu cầu hết lượt) và khẳng định 503 = 0 (và 0 lần thử lại trừ ca `retriesAllowed`: dự đoán P4 của TRACKING 3.31 B14-E, cạnh chu trình đã đo ở B12-Q).

/** Số vòng xen kẽ thứ tự xuất phát */
export const ALTERNATING_ROUNDS = 40;
/** Độ lệch (ms) của bản quét; mỗi độ lệch chạy hai vòng (bên thứ nhất chậm, bên thứ hai chậm) */
export const SWEEP_OFFSETS_MS: readonly number[] = [0, 1, 2, 3, 5, 8, 12, 20];
/** Tổng số vòng của mỗi ca */
export const TOTAL_ROUNDS = ALTERNATING_ROUNDS + SWEEP_OFFSETS_MS.length * 2;

/** Hai thunk cùng xuất phát; bên được chỉ định chậm `offsetMs` rồi mới chạy. */
function sweepPair<A, B>(
  index: number,
  first: () => Promise<A>,
  second: () => Promise<B>,
) {
  const offset = SWEEP_OFFSETS_MS[Math.floor(index / 2)] ?? 0;
  const firstIsLate = index % 2 === 0;
  const gate = createGate(2);
  return [
    async (): Promise<A | B> => {
      await gate.arrive();
      if (firstIsLate && offset > 0) await sleep(offset);
      return first();
    },
    async (): Promise<A | B> => {
      await gate.arrive();
      if (!firstIsLate && offset > 0) await sleep(offset);
      return second();
    },
  ] as const;
}

export interface RaceSpec<C, A, B> {
  /** Nhãn dòng số liệu, ví dụ `B14-DT` */
  tag: string;
  /** Tên ca, ví dụ `OVR-10` */
  name: string;
  /** Mảng log Nest đã gom của test hiện tại (`logs` của `status-int-kit`, truyền tại chỗ gọi) */
  logs: readonly string[];
  /** Dữ liệu SẠCH của vòng `round` */
  setup: (round: number) => Promise<C>;
  first: (context: C) => Promise<A>;
  second: (context: C) => Promise<B>;
  /** Kiểm một vòng (kết quả của `first` và `second`, kèm INV); ghi bên thắng bằng `tally.add` */
  check: (
    context: C,
    first: A,
    second: B,
    tally: ReturnType<typeof winnerTally>,
  ) => Promise<void>;
  options?: ReportOptions;
}

/** Chạy `TOTAL_ROUNDS` vòng của MỘT ca đua rồi báo cáo; hai bên PHẢI trả kết quả có kiểu (không ném: bọc bằng `settle` khi có thể bị 409), lỗi sót là deadlock, hết giờ chờ khoá hay lỗi lạ nên vòng đỏ. */
export async function raceRounds<C, A, B>(spec: RaceSpec<C, A, B>) {
  const tally = winnerTally();
  await runRounds<C, A | B>({
    rounds: TOTAL_ROUNDS,
    setup: spec.setup,
    race: (context, round) =>
      round <= ALTERNATING_ROUNDS
        ? racePair(
            round,
            () => spec.first(context),
            () => spec.second(context),
          )
        : sweepPair(
            round - ALTERNATING_ROUNDS - 1,
            () => spec.first(context),
            () => spec.second(context),
          ),
    check: async (context, results) => {
      const [first, second] = valuesOf(results) as [A, B];
      await spec.check(context, first, second, tally);
    },
  });
  reportRounds(
    spec.tag,
    spec.name,
    TOTAL_ROUNDS,
    tally.winners,
    spec.logs,
    spec.options,
  );
}
