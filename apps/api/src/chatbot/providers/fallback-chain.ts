import {
  MAX_ATTEMPTS_PER_LAYER,
  MIN_ATTEMPT_MS,
} from '../chatbot.constants.js';
import type { ChatbotConfig } from '../config/chatbot.config.js';
import type {
  AiOutputSchema,
  AiProvider,
  AiRequest,
  Clock,
  ProviderName,
} from './ai-provider.js';
import { ProviderError } from './provider-error.js';
import { ProviderQuota } from './provider-quota.js';

/** Kết quả của chuỗi. `fallback` = mọi lớp không trả lời được: người gọi dùng câu dựng sẵn; chuỗi KHÔNG ném lỗi (2.4.76 A1, 2.4.77 A2). */
export type ChainResult<T> =
  | {
      readonly kind: 'answer';
      readonly provider: ProviderName;
      readonly value: T;
    }
  | { readonly kind: 'fallback' };

export interface ChainSettings {
  /** Hạn chót tổng cho cả chuỗi (Q8: 20 giây). */
  readonly totalTimeoutMs: number;
  readonly cooldownMs: number;
  /** Thời gian chờ tối đa MỘT lần thử của từng lớp. */
  readonly layerTimeoutMs: Readonly<Record<ProviderName, number>>;
  /** Trần lời gọi mỗi phút của từng lớp. */
  readonly perMinute: Readonly<Record<ProviderName, number>>;
}

/** Chỉ cần `warn`; `Logger` của Nest dùng được, test dùng bản ghi lại. */
export interface ChainLogger {
  warn(message: string): void;
}

export function chainSettingsFromConfig(config: ChatbotConfig): ChainSettings {
  return {
    totalTimeoutMs: config.totalTimeoutMs,
    cooldownMs: config.cooldownMs,
    layerTimeoutMs: {
      groq: config.groq.timeoutMs,
      gemini: config.gemini.timeoutMs,
    },
    perMinute: { groq: config.groq.perMinute, gemini: config.gemini.perMinute },
  };
}

const FALLBACK = { kind: 'fallback' } as const;

// Kết quả của một lớp: có câu trả lời; sang lớp kế tiếp; hay hết giờ chung (dừng cả chuỗi)
type LayerOutcome<T> =
  | { readonly kind: 'answer'; readonly value: T }
  | { readonly kind: 'next' }
  | { readonly kind: 'outOfTime' };

/**
 * Chuỗi dự phòng (PLAN 5.5; 2.4.76; Q1, Q8; T3, T10): các lớp theo thứ tự, mỗi lớp thử tối đa hai lần, dưới MỘT hạn chót tổng.
 * - Mỗi lần thử chờ `min(thời gian của lớp, thời gian còn lại)`; còn dưới 2 giây thì không thử nữa và trả `fallback` ngay.
 * - Hạn chót do CHUỖI giữ (đua lời gọi với hẹn giờ rồi huỷ `AbortController`), không nhờ adapter tự biết dừng.
 * - Thử lại đúng một lần với timeout, network, server, badOutput; KHÔNG thử lại với 429 và 4xx cấu hình sai (T10).
 * - Cooldown chỉ đặt khi lớp ĐÃ HỎNG (không bao giờ sau thành công); cooldown, trần mỗi phút ở bộ nhớ một tiến trình.
 * Không đọc `.env`, không ghi log nội dung câu hỏi, không log thân lỗi hay khoá.
 */
export class FallbackChain {
  private readonly cooldownUntil = new Map<ProviderName, number>();
  private readonly quota: ProviderQuota;

  constructor(
    private readonly providers: readonly AiProvider[],
    private readonly settings: ChainSettings,
    private readonly clock: Clock,
    private readonly logger: ChainLogger,
  ) {
    this.quota = new ProviderQuota(settings.perMinute, clock);
  }

  async run<T>(request: AiRequest<T>): Promise<ChainResult<T>> {
    const deadline = this.clock.now() + this.settings.totalTimeoutMs;
    for (const provider of this.providers) {
      if (!provider.configured || this.inCooldown(provider.name)) continue;
      const outcome = await this.tryLayer(provider, request, deadline);
      if (outcome.kind === 'answer') {
        return {
          kind: 'answer',
          provider: provider.name,
          value: outcome.value,
        };
      }
      if (outcome.kind === 'outOfTime') return FALLBACK;
    }
    return FALLBACK;
  }

  private inCooldown(name: ProviderName): boolean {
    return this.clock.now() < (this.cooldownUntil.get(name) ?? 0);
  }

  private startCooldown(name: ProviderName): void {
    this.cooldownUntil.set(name, this.clock.now() + this.settings.cooldownMs);
  }

  private async tryLayer<T>(
    provider: AiProvider,
    request: AiRequest<T>,
    deadline: number,
  ): Promise<LayerOutcome<T>> {
    // Lớp đã hỏng ít nhất một lần thì PHẢI vào cooldown dù thoát vì lý do nào (hết giờ, hết suất, hết lần thử)
    let failedOnce = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_LAYER; attempt++) {
      const remaining = deadline - this.clock.now();
      if (remaining < MIN_ATTEMPT_MS) {
        if (failedOnce) this.startCooldown(provider.name);
        return { kind: 'outOfTime' };
      }
      if (!this.quota.tryAcquire(provider.name)) {
        // Chạm trần mỗi phút: bỏ qua lớp, không cooldown nếu lớp chưa hỏng (HDA-11)
        if (failedOnce) this.startCooldown(provider.name);
        return { kind: 'next' };
      }
      const budgetMs = Math.min(
        this.settings.layerTimeoutMs[provider.name],
        remaining,
      );
      try {
        const text = await this.callWithBudget(provider, request, budgetMs);
        const value = parseAnswer(text, request.output);
        return { kind: 'answer', value };
      } catch (error) {
        failedOnce = true;
        const failure = this.describe(provider.name, error);
        if (failure.kind === 'rateLimited' || failure.kind === 'rejected') {
          break; // T10: không thử lại
        }
      }
    }
    this.startCooldown(provider.name);
    return { kind: 'next' };
  }

  // Một lần gọi dưới hạn `budgetMs`: hết hạn thì huỷ `AbortController` (để fetch thật dừng) và coi là timeout.
  // Hẹn giờ LUÔN bị huỷ khi lời gọi xong hay lỗi, không để handle mở.
  private async callWithBudget(
    provider: AiProvider,
    request: AiRequest<unknown>,
    budgetMs: number,
  ): Promise<string> {
    const controller = new AbortController();
    let cancelTimer: () => void = () => undefined;
    const expired = new Promise<never>((_resolve, reject) => {
      cancelTimer = this.clock.setTimer(() => {
        controller.abort();
        reject(new ProviderError('timeout'));
      }, budgetMs);
    });
    // `async` để cả lỗi ném ĐỒNG BỘ của adapter cũng thành promise bị từ chối
    const call = (async () =>
      (await provider.generate(request, controller.signal)).text)();
    try {
      return await Promise.race([call, expired]);
    } finally {
      cancelTimer();
    }
  }

  // Ghi cảnh báo (tên lớp, loại hỏng, mã HTTP; KHÔNG thân lỗi, KHÔNG khoá, KHÔNG thông điệp lỗi lạ) và chuẩn hoá về ProviderError
  private describe(name: ProviderName, error: unknown): ProviderError {
    if (!(error instanceof ProviderError)) {
      const className = error instanceof Error ? error.name : typeof error;
      this.logger.warn(
        `Lớp AI ${name} ném lỗi không dự kiến (${className}); coi như badOutput.`,
      );
      return new ProviderError('badOutput');
    }
    const status =
      error.httpStatus === undefined ? '' : ` (HTTP ${error.httpStatus})`;
    const advice =
      error.kind === 'rejected'
        ? ' Kiểm tra khoá, địa chỉ hoặc model có thể đã ngừng.'
        : '';
    this.logger.warn(`Lớp AI ${name} lỗi: ${error.kind}${status}.${advice}`);
    return error;
  }
}

function parseAnswer<T>(text: string, output: AiOutputSchema<T>): T {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ProviderError('badOutput');
  }
  if (!output.isValid(value)) throw new ProviderError('badOutput');
  return value;
}
