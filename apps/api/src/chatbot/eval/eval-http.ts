// Phần "đường dây" của bộ câu hỏi chuẩn (chatbot X2): ghi lại từng lời gọi HTTP tới nhà cung cấp (mã, thời gian, token, header hạn mức), giãn lời gọi theo hạn mức
// và đếm 429 liên tiếp để dừng hẳn. KHÔNG ghi đầu vào của lời gọi (thân yêu cầu và header khoá không bao giờ vào bản ghi), KHÔNG đọc biến môi trường.
// Đồng hồ và `sleep` tiêm vào được để test chạy tức thì.

export type Layer = 'groq' | 'gemini' | 'khac';

export interface RecordedCall {
  readonly layer: Layer;
  /** `null` khi không tới được máy chủ (hết giờ, mạng). */
  readonly status: number | null;
  readonly ms: number;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly tokensTotal: number | null;
  readonly retryAfterMs: number | null;
  /** Header `x-ratelimit-remaining-tokens` (chỉ Groq có). */
  readonly remainingTokens: number | null;
  /** Header `x-ratelimit-reset-tokens`, đổi sang mili giây. */
  readonly resetMs: number | null;
  readonly error: 'timeout' | 'network' | null;
}

/** Lớp nhà cung cấp theo địa chỉ. Địa chỉ gốc có thể đổi ở cấu hình nên so theo tên miền thường gặp. */
export function layerOfUrl(url: string): Layer {
  if (url.includes('groq.com')) return 'groq';
  if (url.includes('googleapis.com')) return 'gemini';
  return 'khac';
}

/** "7.66s", "2m59.56s", "250ms", "1h2m3s", "12" (giây trần) thành mili giây; không đọc được thì `null`. */
export function parseDurationMs(text: string | null): number | null {
  if (text === null) return null;
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  let total = 0;
  let consumed = 0;
  let matched = false;
  for (const match of trimmed.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) {
    matched = true;
    consumed += match[0].length;
    const value = Number(match[1]);
    const unit = match[2];
    total +=
      unit === 'ms'
        ? value
        : unit === 's'
          ? value * 1000
          : unit === 'm'
            ? value * 60_000
            : value * 3_600_000;
  }
  return matched && consumed === trimmed.length ? Math.round(total) : null;
}

/** `retry-after` bằng giây (số). Dạng ngày HTTP không dùng: trả `null` để nơi gọi dùng mặc định. */
export function parseRetryAfterMs(text: string | null): number | null {
  if (text === null) return null;
  const value = Number(text.trim());
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) : null;
}

const toNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Đọc `usage` của phản hồi thành công: Groq `usage.prompt_tokens/completion_tokens/total_tokens`, Gemini `usage.total_input_tokens/total_output_tokens/total_tokens`. */
export function parseUsage(
  layer: Layer,
  bodyText: string,
): {
  tokensIn: number | null;
  tokensOut: number | null;
  tokensTotal: number | null;
} {
  const none = { tokensIn: null, tokensOut: null, tokensTotal: null };
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return none;
  }
  if (typeof body !== 'object' || body === null) return none;
  const usage = (body as Record<string, unknown>).usage;
  if (typeof usage !== 'object' || usage === null) return none;
  const record = usage as Record<string, unknown>;
  if (layer === 'groq') {
    return {
      tokensIn: toNumber(record.prompt_tokens),
      tokensOut: toNumber(record.completion_tokens),
      tokensTotal: toNumber(record.total_tokens),
    };
  }
  if (layer === 'gemini') {
    return {
      tokensIn: toNumber(record.total_input_tokens),
      tokensOut: toNumber(record.total_output_tokens),
      tokensTotal: toNumber(record.total_tokens),
    };
  }
  return none;
}

type FetchFunction = typeof globalThis.fetch;

function urlOf(input: Parameters<FetchFunction>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isAbortLike(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

/**
 * Bọc `fetch` để lấy mã trạng thái, thời gian, header hạn mức và `usage` MÀ KHÔNG sửa P1: `FetchHttpTransport` nhận `fetchImpl` và tự bỏ header,
 * thân lỗi. Phản hồi trả lại nguyên vẹn (đọc thân bằng bản sao). Không bao giờ ghi URL đầy đủ, header yêu cầu hay thân yêu cầu.
 */
export class CallRecorder {
  private calls: RecordedCall[] = [];

  constructor(
    private readonly real: FetchFunction,
    private readonly now: () => number,
  ) {}

  readonly fetch: FetchFunction = async (input, init) => {
    const layer = layerOfUrl(urlOf(input));
    const started = this.now();
    try {
      const response = await this.real(input, init);
      const usage = response.ok
        ? parseUsage(layer, await response.clone().text())
        : { tokensIn: null, tokensOut: null, tokensTotal: null };
      this.calls.push({
        layer,
        status: response.status,
        ms: Math.round(this.now() - started),
        ...usage,
        retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after')),
        remainingTokens: toNumber(
          Number(response.headers.get('x-ratelimit-remaining-tokens') ?? 'x'),
        ),
        resetMs: parseDurationMs(
          response.headers.get('x-ratelimit-reset-tokens'),
        ),
        error: null,
      });
      return response;
    } catch (error) {
      this.calls.push({
        layer,
        status: null,
        ms: Math.round(this.now() - started),
        tokensIn: null,
        tokensOut: null,
        tokensTotal: null,
        retryAfterMs: null,
        remainingTokens: null,
        resetMs: null,
        error: isAbortLike(error) ? 'timeout' : 'network',
      });
      throw error;
    }
  };

  /** Chỗ cho nhà cung cấp giả của `--dry-run` ghi lời gọi giả. */
  record(call: RecordedCall): void {
    this.calls.push(call);
  }

  /** Lấy và xoá các lời gọi đã ghi từ lần lấy trước. */
  drain(): RecordedCall[] {
    const taken = this.calls;
    this.calls = [];
    return taken;
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Giãn lời gọi

export interface PaceClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

/** Đồng hồ ảo: `sleep` đẩy thời gian chứ không chờ thật (dùng cho `--dry-run` và test). */
export function createVirtualPaceClock(
  start = 0,
): PaceClock & { advance(ms: number): void } {
  let current = start;
  return {
    now: () => current,
    sleep: (ms) => {
      current += Math.max(0, ms);
      return Promise.resolve();
    },
    advance: (ms) => {
      current += ms;
    },
  };
}

export function createRealPaceClock(): PaceClock {
  return {
    now: () => Date.now(),
    sleep: (ms) =>
      new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms))),
  };
}

/** Giá trị mặc định (kế hoạch X2 mục d.5). `[đề xuất]`: 8.000 token mỗi phút và 200.000 mỗi ngày là GIẢ ĐỊNH theo bảng Developer của Groq, chưa phải số console. */
export const PACING_DEFAULTS = {
  gapMs: 4000,
  groqTpm: 8000,
  groqTpd: 200_000,
  /** Token ước cho một lời gọi Groq trước khi có số thật (X1: p95 vào 1.937 và ra 126, cộng đệm cho lịch sử). */
  estimateGroqTokens: 2400,
  /** Sau một 429 thì chờ `retry-after` nhưng không ít hơn cooldown 60 giây của chuỗi và không quá 300 giây. */
  blockMinMs: 60_000,
  blockMaxMs: 300_000,
  /** Dừng hẳn sau chừng này lần 429 liên tiếp từ cùng một lớp. */
  max429InARow: 3,
} as const;

export interface PacerConfig {
  readonly gapMs: number;
  readonly groqTpm: number;
  readonly groqTpd: number;
  readonly groqUsedToday: number;
  /** Có lớp Groq trong lần chạy này không (không có thì bỏ qua mọi tính toán token). */
  readonly groqActive: boolean;
}

const WINDOW_MS = 60_000;
const RESET_MARGIN_MS = 500;

export class Pacer {
  private lastStart = Number.NEGATIVE_INFINITY;
  private blockedUntil = 0;
  private remainingTokens: number | null = null;
  private resetAt: number | null = null;
  private window: { t: number; tokens: number }[] = [];
  private usedThisRun = 0;

  constructor(
    private readonly clock: PaceClock,
    private readonly config: PacerConfig,
  ) {}

  /** Token Groq đã dùng trong ngày theo khai báo của người chạy cộng với lần chạy này. */
  get groqTokensToday(): number {
    return this.config.groqUsedToday + this.usedThisRun;
  }

  get groqTokensThisRun(): number {
    return this.usedThisRun;
  }

  /** Còn ngân sách ngày cho một câu cần AI không? Câu do luật bắt trước AI luôn được. */
  affords(aiBound: boolean): boolean {
    if (!aiBound || !this.config.groqActive) return true;
    return (
      this.groqTokensToday + PACING_DEFAULTS.estimateGroqTokens <=
      this.config.groqTpd
    );
  }

  /** Chờ đủ điều kiện rồi trả số mili giây đã chờ. Câu không cần AI thì không chờ. */
  async before(aiBound: boolean): Promise<number> {
    if (!aiBound) return 0;
    const started = this.clock.now();
    const blocked = this.blockedUntil - this.clock.now();
    if (blocked > 0) await this.clock.sleep(blocked);
    const gap = this.lastStart + this.config.gapMs - this.clock.now();
    if (gap > 0) await this.clock.sleep(gap);
    if (this.config.groqActive)
      await this.waitForTokens(PACING_DEFAULTS.estimateGroqTokens);
    this.lastStart = this.clock.now();
    return Math.round(this.clock.now() - started);
  }

  private async waitForTokens(estimate: number): Promise<void> {
    if (this.remainingTokens !== null && this.resetAt !== null) {
      if (this.remainingTokens < estimate && this.resetAt > this.clock.now()) {
        await this.clock.sleep(
          this.resetAt - this.clock.now() + RESET_MARGIN_MS,
        );
      }
      this.remainingTokens = null;
      this.resetAt = null;
      return;
    }
    for (;;) {
      const now = this.clock.now();
      this.window = this.window.filter((entry) => now - entry.t < WINDOW_MS);
      const used = this.window.reduce((sum, entry) => sum + entry.tokens, 0);
      const oldest = this.window[0];
      if (used + estimate <= this.config.groqTpm || oldest === undefined)
        return;
      await this.clock.sleep(oldest.t + WINDOW_MS - now + 100);
    }
  }

  /** Sau mỗi câu: nhớ token đã dùng, header hạn mức còn lại và thời điểm được gọi lại sau 429. */
  after(calls: readonly RecordedCall[]): void {
    const now = this.clock.now();
    for (const call of calls) {
      if (call.layer === 'groq') {
        const used =
          call.tokensTotal ??
          (call.status !== null && call.status >= 200 && call.status < 300
            ? PACING_DEFAULTS.estimateGroqTokens
            : null);
        if (used !== null) {
          this.window.push({ t: now, tokens: used });
          this.usedThisRun += used;
        }
        if (call.remainingTokens !== null && call.resetMs !== null) {
          this.remainingTokens = call.remainingTokens;
          this.resetAt = now + call.resetMs;
        }
      }
      if (call.status === 429) {
        const wait = Math.min(
          PACING_DEFAULTS.blockMaxMs,
          Math.max(
            PACING_DEFAULTS.blockMinMs,
            call.retryAfterMs ?? PACING_DEFAULTS.blockMinMs,
          ),
        );
        this.blockedUntil = Math.max(this.blockedUntil, now + wait);
      }
    }
  }
}

/** Đếm 429 liên tiếp theo từng lớp; một mã 2xx của lớp đó đặt lại bộ đếm. Đủ `limit` thì "ngắt". */
export class RateLimitGuard {
  private readonly runs = new Map<Layer, number>();
  private trippedLayer: Layer | null = null;

  constructor(private readonly limit: number = PACING_DEFAULTS.max429InARow) {}

  record(calls: readonly RecordedCall[]): void {
    for (const call of calls) {
      if (call.status === 429) {
        const next = (this.runs.get(call.layer) ?? 0) + 1;
        this.runs.set(call.layer, next);
        if (next >= this.limit && this.trippedLayer === null)
          this.trippedLayer = call.layer;
      } else if (
        call.status !== null &&
        call.status >= 200 &&
        call.status < 300
      ) {
        this.runs.set(call.layer, 0);
      }
    }
  }

  tripped(): Layer | null {
    return this.trippedLayer;
  }
}
