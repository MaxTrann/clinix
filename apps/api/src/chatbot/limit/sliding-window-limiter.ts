// chatbot B1 — cửa sổ trượt trong bộ nhớ, theo khoá (PLAN chatbot 5.10, T6). Chỉ là bộ nhớ một tiến trình, không DB, không Redis, không log.
// Dùng cho giới hạn theo IP của Trợ lý AI (request-limiter.ts); không biết gì về khoá là gì nên dùng lại được cho khoá khác.

export interface WindowRule<R extends string> {
  /** Độ dài cửa sổ (mili giây). */
  readonly windowMs: number;
  /** Số lời gọi tối đa trong cửa sổ. */
  readonly limit: number;
  /** Nhãn trả về khi luật này chặn (để nơi gọi chọn câu chữ). */
  readonly reason: R;
}

export type WindowDecision<R extends string> =
  { allowed: true } | { allowed: false; reason: R; retryAfterSeconds: number };

export interface SlidingWindowOptions<R extends string> {
  readonly rules: readonly WindowRule<R>[];
  /** Trần số khoá giữ trong bộ nhớ; vượt thì bỏ khoá được ghi lần cuối xa nhất. */
  readonly maxKeys: number;
  /** Đồng hồ (mili giây). Mặc định `Date.now`; test tiêm đồng hồ giả. */
  readonly now?: () => number;
}

export class SlidingWindowLimiter<R extends string> {
  // Thứ tự duyệt của Map = thứ tự chèn. Mỗi lần ghi nhận ta xoá rồi chèn lại nên khoá đầu tiên luôn là khoá được ghi lần cuối xa nhất:
  // mục quá hạn nằm ở đầu (dọn O(1) khấu hao) và bỏ mục cũ nhất khi đầy cũng là lấy khoá đầu.
  private readonly hits = new Map<string, number[]>();
  private readonly longestWindowMs: number;
  private readonly now: () => number;

  constructor(private readonly options: SlidingWindowOptions<R>) {
    if (options.rules.length === 0) {
      throw new RangeError('Cần ít nhất một luật cửa sổ');
    }
    for (const rule of options.rules) {
      if (!Number.isInteger(rule.limit) || rule.limit < 1) {
        throw new RangeError('limit phải là số nguyên từ 1');
      }
      if (!Number.isFinite(rule.windowMs) || rule.windowMs <= 0) {
        throw new RangeError('windowMs phải là số dương');
      }
    }
    if (!Number.isInteger(options.maxKeys) || options.maxKeys < 1) {
      throw new RangeError('maxKeys phải là số nguyên từ 1');
    }
    this.longestWindowMs = Math.max(
      ...options.rules.map((rule) => rule.windowMs),
    );
    this.now = options.now ?? Date.now;
  }

  /** Số khoá đang giữ. */
  get size(): number {
    return this.hits.size;
  }

  /**
   * Kiểm mọi luật rồi (chỉ khi tất cả cho qua) ghi nhận lời gọi này, trong MỘT đoạn đồng bộ, không `await`:
   * hai lời gọi không thể cùng lọt qua trần (GHT-05). Lời bị từ chối KHÔNG được ghi (không kéo dài thời gian chờ, không phình bộ nhớ).
   * Cửa sổ nửa mở `(now - W, now]`: mốc đúng W mili giây trước đã rời cửa sổ.
   */
  tryConsume(key: string): WindowDecision<R> {
    const now = this.now();
    this.dropExpiredKeys(now);

    const stamps = this.hits.get(key) ?? [];
    this.dropStaleStamps(stamps, now);

    let blocked: { reason: R; waitMs: number } | null = null;
    for (const rule of this.options.rules) {
      const windowStart = now - rule.windowMs;
      const inWindow = stamps.filter((stamp) => stamp > windowStart).length;
      if (inWindow < rule.limit) continue;
      // Lời gọi được nhận lại khi chỉ còn `limit - 1` mốc trong cửa sổ: tức khi mốc thứ `limit` tính từ mới nhất rời đi
      const releasing = stamps[stamps.length - rule.limit] ?? now;
      const waitMs = releasing + rule.windowMs - now;
      if (blocked === null || waitMs > blocked.waitMs) {
        blocked = { reason: rule.reason, waitMs };
      }
    }
    if (blocked !== null) {
      return {
        allowed: false,
        reason: blocked.reason,
        retryAfterSeconds: Math.max(1, Math.ceil(blocked.waitMs / 1000)),
      };
    }

    stamps.push(now);
    this.hits.delete(key);
    this.hits.set(key, stamps);
    while (this.hits.size > this.options.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
    return { allowed: true };
  }

  // Bỏ các khoá mà lần ghi cuối đã quá cửa sổ dài nhất. Chúng nằm liền ở đầu Map nên dừng ở khoá còn hạn đầu tiên
  // (nếu đồng hồ lùi thì có thể dọn thiếu, vô hại).
  private dropExpiredKeys(now: number): void {
    const cutoff = now - this.longestWindowMs;
    for (const [key, stamps] of this.hits) {
      const last = stamps[stamps.length - 1];
      if (last !== undefined && last > cutoff) break;
      this.hits.delete(key);
    }
  }

  // Bỏ các mốc đã ngoài cửa sổ dài nhất để mảng không quá `limit` lớn nhất phần tử
  private dropStaleStamps(stamps: number[], now: number): void {
    const cutoff = now - this.longestWindowMs;
    let stale = 0;
    while (stale < stamps.length && (stamps[stale] ?? 0) <= cutoff) stale += 1;
    if (stale > 0) stamps.splice(0, stale);
  }
}
