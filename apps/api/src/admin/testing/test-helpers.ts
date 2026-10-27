import { vi } from 'vitest';

/** Chỉ giả Date; timer thật cần cho I/O MySQL. Luôn gọi restore trong afterEach. */
export function freezeTime(instant: Date) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(instant);
  return {
    set: (next: Date) => vi.setSystemTime(next),
    restore: () => vi.useRealTimers(),
  };
}

/** Chưa có MailService thật: test cung cấp kiểu tham số, không chốt API của auth. */
export function createMailMock<Args extends unknown[] = unknown[]>() {
  return vi.fn<(...args: Args) => Promise<void>>().mockResolvedValue(undefined);
}

/** Nhận callback để không chạy sớm; đợi TẤT CẢ tác vụ trước khi test dọn DB. */
export async function runConcurrently<T>(
  operations: readonly (() => Promise<T>)[],
): Promise<PromiseSettledResult<T>[]> {
  return Promise.all(
    operations.map(async (operation): Promise<PromiseSettledResult<T>> => {
      // Cùng nhường một lượt microtask trước khi gọi, kể cả callback ném lỗi đồng bộ.
      await Promise.resolve();
      try {
        return { status: 'fulfilled', value: await operation() };
      } catch (reason: unknown) {
        return { status: 'rejected', reason };
      }
    }),
  );
}
