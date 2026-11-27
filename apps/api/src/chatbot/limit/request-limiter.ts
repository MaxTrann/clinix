import {
  SlidingWindowLimiter,
  type WindowDecision,
} from './sliding-window-limiter.js';

// chatbot B1 — giới hạn tốc độ của Trợ lý AI theo IP và theo số lời gọi AI chạy cùng lúc (PLAN chatbot 5.4 bước 4 và 7, 5.10, Q7, T6).
// Chỉ là bộ nhớ một tiến trình (khởi động lại thì mất; nhiều tiến trình thì mỗi tiến trình một bộ đếm; ghi nợ ở TECH_DEBT).
// Con số truyền qua hàm dựng (mặc định bằng PLAN); KHÔNG đọc biến môi trường: chatbot B3 đọc `AI_IP_PER_MINUTE`… rồi truyền vào.
// Không log gì: IP chỉ nằm trong bộ nhớ, tối đa 24 giờ (PLAN 5.9).

export const DEFAULT_REQUEST_LIMITS = {
  ipPerMinute: 5,
  ipPerDay: 50,
  maxConcurrent: 3,
  maxTrackedIps: 10_000,
} as const;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
// Chuỗi IPv6 dài nhất là 45 ký tự; cắt ở 64 để khoá lạ không chiếm bộ nhớ
const IP_MAX_LENGTH = 64;
const UNKNOWN_IP = 'unknown';

export type IpLimitReason = 'PER_MINUTE' | 'PER_DAY';
export type IpDecision = WindowDecision<IpLimitReason>;
export type SlotResult<T> = { acquired: true; value: T } | { acquired: false };

export interface RequestLimiterOptions {
  readonly ipPerMinute?: number;
  readonly ipPerDay?: number;
  readonly maxConcurrent?: number;
  readonly maxTrackedIps?: number;
  /** Đồng hồ (mili giây); mặc định `Date.now`. */
  readonly now?: () => number;
}

/**
 * Cùng một máy có thể hiện ra dưới vài dạng (`::ffff:1.2.3.4` ở socket hai ngăn, hoa thường, vùng `%eth0`): đưa về một dạng để chung bộ đếm.
 * IP thiếu hoặc rỗng dùng chung khoá `unknown` (siết chung, không bỏ qua giới hạn). Khoá IPv6 theo `/64` chưa làm (ghi nợ).
 */
export function normalizeIp(ip: string | null | undefined): string {
  const lowered = (typeof ip === 'string' ? ip : '').trim().toLowerCase();
  const withoutZone = lowered.split('%')[0] ?? '';
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(withoutZone);
  const normalized = (mapped?.[1] ?? withoutZone).slice(0, IP_MAX_LENGTH);
  return normalized === '' ? UNKNOWN_IP : normalized;
}

export class RequestLimiter {
  private readonly ipWindow: SlidingWindowLimiter<IpLimitReason>;
  private readonly maxConcurrent: number;
  private active = 0;

  constructor(options: RequestLimiterOptions = {}) {
    this.maxConcurrent =
      options.maxConcurrent ?? DEFAULT_REQUEST_LIMITS.maxConcurrent;
    if (!Number.isInteger(this.maxConcurrent) || this.maxConcurrent < 1) {
      throw new RangeError('maxConcurrent phải là số nguyên từ 1');
    }
    this.ipWindow = new SlidingWindowLimiter<IpLimitReason>({
      rules: [
        {
          windowMs: MINUTE_MS,
          limit: options.ipPerMinute ?? DEFAULT_REQUEST_LIMITS.ipPerMinute,
          reason: 'PER_MINUTE',
        },
        {
          windowMs: DAY_MS,
          limit: options.ipPerDay ?? DEFAULT_REQUEST_LIMITS.ipPerDay,
          reason: 'PER_DAY',
        },
      ],
      maxKeys: options.maxTrackedIps ?? DEFAULT_REQUEST_LIMITS.maxTrackedIps,
      ...(options.now === undefined ? {} : { now: options.now }),
    });
  }

  /** Số IP đang được đếm. */
  get trackedIps(): number {
    return this.ipWindow.size;
  }

  /** Số suất đang giữ. */
  get activeSlots(): number {
    return this.active;
  }

  /**
   * Bước 4 của 5.4: kiểm cả hai luật rồi ghi nhận lời gọi, MỘT đoạn đồng bộ (không `await`; GHT-05).
   * Bị chặn: `retryAfterSeconds` là số giây nguyên ≥ 1 cho `Retry-After` (chatbot B3 đổi thành 429 `TRO_LY_HOI_QUA_NHANH`).
   * Câu khẩn cấp KHÔNG được gọi hàm này (bước 3 đứng trước và miễn giới hạn): thứ tự đó do chatbot B3 bảo đảm (GHT-06).
   */
  checkIp(ip: string | null | undefined): IpDecision {
    return this.ipWindow.tryConsume(normalizeIp(ip));
  }

  /**
   * Bước 7 của 5.4: giữ một suất rồi chạy `task`, trả suất trong `finally` kể cả khi `task` ném lỗi (lỗi vẫn ra ngoài).
   * Hết suất thì trả `{ acquired: false }` ngay, không xếp hàng (chatbot B3 đổi thành 503 `TRO_LY_DANG_BAN`).
   * Kiểm và tăng bộ đếm nằm trước `await` đầu tiên nên chạy đồng bộ khi gọi: hai lời gọi không cùng lọt qua trần.
   */
  async withSlot<T>(task: () => Promise<T>): Promise<SlotResult<T>> {
    if (this.active >= this.maxConcurrent) return { acquired: false };
    this.active += 1;
    try {
      return { acquired: true, value: await task() };
    } finally {
      this.active -= 1;
    }
  }
}
