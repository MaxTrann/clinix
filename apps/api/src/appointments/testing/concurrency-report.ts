import { expect } from 'vitest';
import { summarize } from './concurrency-harness.js';

// Bộ đếm và báo cáo DÙNG CHUNG của các ca đồng thời của booking (task B12; TRACKING 3.26 B12-H; gom từ int-spec đồng thời của B10 để jscpd, vốn quét cả `*.int-spec.ts`, không thấy cùng một đoạn ở hai nơi).
// Yêu cầu của Đại 12/11/2026: mỗi ca đồng thời ĐẾM lần thử lại 1213/1205 và GHI bên thắng mỗi vòng. `withBookingTransaction` ghi một dòng cảnh báo mỗi lần thử lại
// (`<nhãn>: MySQL 1213|1205 ở lần chạy n/3, thử lại|hết lượt thử lại`); `useIntegrationHooks` đã gom mọi dòng Logger của Nest từ đầu test vào mảng `logs` mà người gọi truyền vào.
const RETRY_WARNING =
  /^(\S+): MySQL (1213|1205) ở lần chạy \d+\/\d+, (thử lại|hết lượt thử lại)$/;

/** Số lần thử lại theo `nhãn + mã lỗi` và số lần hết lượt (503), từ đầu test tới giờ. */
export function retryStats(logs: readonly string[]): {
  retries: Record<string, number>;
  exhausted: number;
} {
  const retries: Record<string, number> = {};
  let exhausted = 0;
  for (const line of logs) {
    const match = RETRY_WARNING.exec(line);
    if (match === null) continue;
    if (match[3] === 'hết lượt thử lại') exhausted += 1;
    else {
      const key = `${match[1] ?? '?'} MySQL ${match[2] ?? '?'}`;
      retries[key] = (retries[key] ?? 0) + 1;
    }
  }
  return { retries, exhausted };
}

/** Bên thắng mỗi vòng: tăng bộ đếm theo nhãn. */
export function winnerTally() {
  const winners: Record<string, number> = {};
  return {
    winners,
    add: (label: string) => {
      winners[label] = (winners[label] ?? 0) + 1;
    },
  };
}

export interface ReportOptions {
  /**
   * Ca có cơ chế khoá NGẦM đã đo (B12-Q, 12/11/2026): `UPDATE lich_hen SET trang_thai` xin khoá S trên hàng cha `benh_nhan` sau khi đã giữ X trên `lich_hen` (chỉ mục khoá ngoại `lich_hen_index_9` có cột `trang_thai`), nên
   * `markNoShow` (khoá `benh_nhan` rồi `lich_hen`) đua với đổi trạng thái của CÙNG MỘT lịch có thể deadlock 1213 và được `withBookingTransaction` thử lại (rủi ro Đại chấp nhận). Khi `true`: vẫn IN số lần thử lại nhưng KHÔNG
   * khẳng định 0; vẫn khẳng định không có yêu cầu hết lượt (503) (kết quả đúng, INV xanh, không lỗi lạ do chính ca kiểm).
   */
  retriesAllowed?: boolean;
}

/**
 * In MỘT dòng số liệu của ca (vào log của vitest, tiền tố `[tag]`) rồi khẳng định KHÔNG có lần thử lại nào (trừ `options.retriesAllowed`) và không có yêu cầu hết lượt (503): thứ tự khoá 5.3 không có deadlock nào, kể cả trước khi thử lại
 * (B10, đột biến M2: đảo thứ tự khoá cho 10 đến 40 lần 1213 mà ca vẫn xanh vì `withBookingTransaction` chạy lại thân; nên số thử lại khác 0 là THỨ TỰ KHOÁ SAI, không phải "kết quả đúng").
 */
export function reportRounds(
  tag: string,
  name: string,
  rounds: number,
  winners: Record<string, number>,
  logs: readonly string[],
  options: ReportOptions = {},
): void {
  const { retries, exhausted } = retryStats(logs);
  const total = Object.values(retries).reduce((sum, n) => sum + n, 0);
  console.info(
    `[${tag}] ${name}: ${String(rounds)} vòng; bên thắng ${JSON.stringify(winners)}; thử lại ${JSON.stringify(retries)} (tổng ${String(total)}); hết lượt (503) ${String(exhausted)}`,
  );
  if (options.retriesAllowed !== true)
    expect(
      total,
      `${name}: có ${String(total)} lần thử lại 1213/1205 ${JSON.stringify(retries)}`,
    ).toBe(0);
  expect(exhausted, `${name}: có yêu cầu hết lượt thử lại (503)`).toBe(0);
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Mọi yêu cầu của vòng phải XONG (kết quả có kiểu, không ném): lỗi sót là deadlock, hết giờ chờ khoá hay lỗi lạ. */
export const valuesOf = <T>(
  results: readonly PromiseSettledResult<T>[],
): T[] => {
  const { values, reasons } = summarize(results);
  if (reasons.length > 0)
    throw new Error(`yêu cầu ném lỗi: ${String(reasons[0])}`);
  return values;
};
