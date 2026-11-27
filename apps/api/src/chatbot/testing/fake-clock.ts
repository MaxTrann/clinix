import type { Clock } from '../providers/ai-provider.js';

interface PendingTimer {
  readonly id: number;
  readonly at: number;
  readonly callback: () => void;
}

/**
 * Đồng hồ ảo cho test của chuỗi dự phòng (HDA-08, HDA-09): thời gian chỉ trôi khi test gọi `advance`, nên "20 giây" tốn 0 giây thật.
 * Hẹn giờ đến hạn chạy ĐÚNG THỨ TỰ và đồng bộ.
 */
export class FakeClock implements Clock {
  private current: number;
  private nextId = 1;
  private pending: PendingTimer[] = [];
  /** Mọi hẹn giờ từng đặt, theo thứ tự, tính bằng mili giây chờ: kiểm "mỗi lần thử chờ bao lâu". */
  readonly startedDelays: number[] = [];

  constructor(start = 0) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  setTimer(callback: () => void, ms: number): () => void {
    const id = this.nextId++;
    this.pending.push({ id, at: this.current + ms, callback });
    this.startedDelays.push(ms);
    return () => {
      this.pending = this.pending.filter((timer) => timer.id !== id);
    };
  }

  /** Số hẹn giờ chưa chạy và chưa huỷ: phải bằng 0 khi chuỗi đã xong (không để lại handle mở). */
  get pendingCount(): number {
    return this.pending.length;
  }

  /** Thời điểm của hẹn giờ gần nhất, `undefined` nếu không còn. */
  nextTimerAt(): number | undefined {
    return this.pending.reduce<number | undefined>(
      (earliest, timer) =>
        earliest === undefined || timer.at < earliest ? timer.at : earliest,
      undefined,
    );
  }

  /** Cho thời gian trôi `ms`, chạy các hẹn giờ đến hạn theo thứ tự (hẹn giờ mới đặt trong lúc chạy cũng được xét). */
  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      const due = this.pending
        .filter((timer) => timer.at <= target)
        .sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (due === undefined) break;
      this.pending = this.pending.filter((timer) => timer.id !== due.id);
      this.current = Math.max(this.current, due.at);
      due.callback();
    }
    this.current = target;
  }
}

/** Nhường cho mọi promise đang chờ chạy hết (hàng đợi vi tác vụ cạn trước khi tới `setImmediate`). */
export async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

/**
 * Chạy `promise` tới khi xong bằng cách nhảy thẳng tới hẹn giờ kế tiếp của đồng hồ ảo mỗi khi mọi việc đang chờ.
 * Không còn hẹn giờ mà promise vẫn treo thì ném lỗi (chuỗi bị kẹt, không phải test chờ mãi).
 */
export async function drive<T>(
  clock: FakeClock,
  promise: Promise<T>,
): Promise<T> {
  let finished = false;
  const watched = promise.then(
    (value) => {
      finished = true;
      return value;
    },
    (error: unknown) => {
      finished = true;
      throw error;
    },
  );
  watched.catch(() => undefined); // tránh "unhandled" nếu vòng dưới ném trước
  for (let turn = 0; !finished; turn++) {
    if (turn > 1000) throw new Error('drive: quá 1000 vòng mà chưa xong');
    await settle();
    if (finished) break;
    const next = clock.nextTimerAt();
    if (next === undefined) {
      throw new Error('drive: không còn hẹn giờ nhưng promise vẫn treo');
    }
    clock.advance(next - clock.now());
  }
  return watched;
}
