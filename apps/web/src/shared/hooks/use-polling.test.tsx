import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePolling } from './use-polling';

// chat F1 (T10) — hook thăm dò dùng chung. Hành vi chuông (nhịp, tab ẩn, focus, không chồng, mất mạng) đã khoá ở `use-unread-count.test.tsx` (WTB-02, WTB-04,
// không sửa); file này chỉ kiểm phần hook mới thêm: nhịp theo tham số, `task` mới nhất, lỗi không làm dừng vòng, gỡ thì huỷ lời gọi đang bay. Đồng hồ giả.
let visibility: DocumentVisibilityState = 'visible';

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'visibilityState');
  Reflect.deleteProperty(navigator, 'onLine');
});

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('usePolling (chat F1, T10)', () => {
  it('gọi ngay khi gắn rồi theo nhịp truyền vào (15 giây); chưa đủ nhịp thì không gọi', async () => {
    const task = vi.fn(() => Promise.resolve());
    const view = renderHook(() => usePolling(task, 15_000));
    await flush();
    expect(task).toHaveBeenCalledTimes(1);
    await flush(14_999);
    expect(task).toHaveBeenCalledTimes(1);
    await flush(1);
    expect(task).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('task ném lỗi ⇒ không ném ra ngoài, vòng vẫn hẹn lượt sau', async () => {
    const task = vi
      .fn<(signal: AbortSignal) => Promise<void>>()
      .mockRejectedValueOnce(new Error('mạng'))
      .mockResolvedValue(undefined);
    const view = renderHook(() => usePolling(task, 1_000));
    await flush();
    await flush(1_000);
    expect(task).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('đổi task khi render lại ⇒ lượt sau gọi task MỚI, không khởi động lại vòng (không gọi thêm ngay)', async () => {
    const first = vi.fn(() => Promise.resolve());
    const second = vi.fn(() => Promise.resolve());
    const view = renderHook(({ task }) => usePolling(task, 1_000), {
      initialProps: { task: first },
    });
    await flush();
    view.rerender({ task: second });
    await flush();
    expect(second).not.toHaveBeenCalled();
    await flush(1_000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('gỡ khi lời gọi đang bay ⇒ tín hiệu bị huỷ; không còn lượt nào sau đó', async () => {
    let signal: AbortSignal | undefined;
    const task = vi.fn(
      (s: AbortSignal) =>
        new Promise<void>((resolve) => {
          signal = s;
          s.addEventListener('abort', () => resolve());
        }),
    );
    const view = renderHook(() => usePolling(task, 1_000));
    await flush();
    expect(signal?.aborted).toBe(false);
    view.unmount();
    expect(signal?.aborted).toBe(true);
    await flush(5_000);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
