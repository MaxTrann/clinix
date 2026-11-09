import { runConcurrently } from '../../admin/testing/test-helpers.js';

// Công cụ test chạy đua cho module doctor (DH-*). Tái dùng `runConcurrently` của admin, chỉ thêm phần còn thiếu.
export { runConcurrently };

/**
 * Cổng chặn: mỗi bên gọi `arrive()` rồi đợi; khi đủ `parties` bên đã tới thì tất cả cùng chạy tiếp.
 * Gọi `arrive()` SAU khi đã giữ khoá ở bước đầu của giao dịch để chắc chắn các giao dịch chồng lên nhau,
 * thay vì chạy tuần tự "may mắn" vì bên nào xong trước.
 */
export function createGate(parties: number): { arrive: () => Promise<void> } {
  let waiting = 0;
  let release!: () => void;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    arrive: () => {
      waiting += 1;
      if (waiting >= parties) release();
      return opened;
    },
  };
}

export interface OutcomeSummary<T> {
  values: T[];
  reasons: unknown[];
}

/** Tách kết quả của `runConcurrently` thành các giá trị thành công và các lỗi. */
export function summarize<T>(
  results: readonly PromiseSettledResult<T>[],
): OutcomeSummary<T> {
  const values: T[] = [];
  const reasons: unknown[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') values.push(result.value);
    else reasons.push(result.reason);
  }
  return { values, reasons };
}
