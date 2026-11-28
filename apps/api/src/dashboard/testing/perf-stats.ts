import { performance } from 'node:perf_hooks';

// Thống kê thời gian cho phép đo thật của dashboard X1 (PLAN dashboard 5.14): làm nóng 5 lần, đo 30 lần, lấy p95.
// p95 theo "hạng gần nhất" (nearest-rank): phần tử thứ ⌈0,95·n⌉ của dãy đã sắp tăng dần; 30 mẫu ⇒ mẫu thứ 29. Không nội suy, nên số báo
// ra luôn là một lần đo có thật.

export const WARMUP_RUNS = 5;
export const MEASURED_RUNS = 30;

export interface TimingSummary {
  /** Số mẫu đã đo (không kể lần làm nóng) */
  n: number;
  p50: number;
  p95: number;
  max: number;
}

/** Phân vị theo hạng gần nhất, `q` trong (0, 1]. Dãy rỗng là lỗi của người gọi. */
export function percentile(samples: readonly number[], q: number): number {
  if (samples.length === 0) throw new Error('Không có mẫu nào để tính phân vị');
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(q * sorted.length));
  return sorted[rank - 1] as number;
}

export function summarize(samples: readonly number[]): TimingSummary {
  return {
    n: samples.length,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    max: Math.max(...samples),
  };
}

/** Chạy `work` tuần tự: `warmup` lần bỏ đi rồi `runs` lần đo (mili giây). */
export async function measure(
  work: () => Promise<unknown>,
  options: { warmup?: number; runs?: number } = {},
): Promise<TimingSummary> {
  const warmup = options.warmup ?? WARMUP_RUNS;
  const runs = options.runs ?? MEASURED_RUNS;
  for (let i = 0; i < warmup; i += 1) await work();
  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    await work();
    samples.push(performance.now() - start);
  }
  return summarize(samples);
}
