import type { EnvironmentVariables } from '../../config/env.validation.js';
import { DEPRECATED_MODELS } from '../chatbot.constants.js';

// Cấu hình Trợ lý AI đã qua `validateEnv` (config/env.validation.ts, khối `AI_…`). TẤT CẢ biến đều tuỳ chọn: không có khoá nào thì
// API vẫn khởi động và Trợ lý trả câu dựng sẵn (CFG-02). Hàm thuần, không đọc process.env (nếp `mail/mail-config.ts`).

export interface ProviderSettings {
  /** Không có khoá thì lớp bị chuỗi bỏ qua. */
  readonly apiKey?: string;
  readonly model: string;
  /** Địa chỉ gốc đã bỏ dấu `/` cuối. */
  readonly baseUrl: string;
  /** Thời gian chờ tối đa một lần thử (mili giây). */
  readonly timeoutMs: number;
  /** Trần lời gọi mỗi phút. */
  readonly perMinute: number;
}

export interface ChatbotConfig {
  /** `AI_ENABLED=false` thì mọi câu hỏi nhận câu dựng sẵn. */
  readonly enabled: boolean;
  readonly totalTimeoutMs: number;
  readonly cooldownMs: number;
  readonly groq: ProviderSettings;
  readonly gemini: ProviderSettings;
  /** Khai ở P1, dùng ở chatbot B1 (Q7). */
  readonly limits: {
    readonly ipPerMinute: number;
    readonly ipPerDay: number;
    readonly maxConcurrent: number;
  };
}

export type ChatbotEnv = Pick<
  EnvironmentVariables,
  | 'AI_ENABLED'
  | 'GROQ_API_KEY'
  | 'GEMINI_API_KEY'
  | 'GROQ_MODEL'
  | 'GEMINI_MODEL'
  | 'GROQ_BASE_URL'
  | 'GEMINI_BASE_URL'
  | 'AI_GROQ_TIMEOUT_MS'
  | 'AI_GEMINI_TIMEOUT_MS'
  | 'AI_TOTAL_TIMEOUT_MS'
  | 'AI_COOLDOWN_SECONDS'
  | 'AI_IP_PER_MINUTE'
  | 'AI_IP_PER_DAY'
  | 'AI_MAX_CONCURRENT'
  | 'AI_GROQ_PER_MINUTE'
  | 'AI_GEMINI_PER_MINUTE'
>;

const withoutTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

export function readChatbotConfig(env: ChatbotEnv): ChatbotConfig {
  return {
    enabled: env.AI_ENABLED,
    totalTimeoutMs: env.AI_TOTAL_TIMEOUT_MS,
    cooldownMs: env.AI_COOLDOWN_SECONDS * 1000,
    groq: {
      ...(env.GROQ_API_KEY === undefined ? {} : { apiKey: env.GROQ_API_KEY }),
      model: env.GROQ_MODEL,
      baseUrl: withoutTrailingSlash(env.GROQ_BASE_URL),
      timeoutMs: env.AI_GROQ_TIMEOUT_MS,
      perMinute: env.AI_GROQ_PER_MINUTE,
    },
    gemini: {
      ...(env.GEMINI_API_KEY === undefined
        ? {}
        : { apiKey: env.GEMINI_API_KEY }),
      model: env.GEMINI_MODEL,
      baseUrl: withoutTrailingSlash(env.GEMINI_BASE_URL),
      timeoutMs: env.AI_GEMINI_TIMEOUT_MS,
      perMinute: env.AI_GEMINI_PER_MINUTE,
    },
    limits: {
      ipPerMinute: env.AI_IP_PER_MINUTE,
      ipPerDay: env.AI_IP_PER_DAY,
      maxConcurrent: env.AI_MAX_CONCURRENT,
    },
  };
}

/**
 * Cảnh báo khi model cấu hình nằm trong danh sách đã ngừng (T4, R1): API vẫn khởi động (không có chuyện từ chối khởi động vì một model).
 * Thông điệp nêu TÊN biến và tên model; không bao giờ có khoá.
 */
export function findDeprecatedModels(config: ChatbotConfig): string[] {
  const variableOf = { groq: 'GROQ_MODEL', gemini: 'GEMINI_MODEL' } as const;
  return DEPRECATED_MODELS.filter(
    (entry) => config[entry.provider].model === entry.model,
  ).map(
    (entry) =>
      `${variableOf[entry.provider]}=${entry.model}: model này đã ngừng từ ${entry.since}, lời gọi sẽ bị từ chối; hãy đổi sang model còn dùng được.`,
  );
}
