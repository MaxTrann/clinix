import { nowVN } from '../../common/time/time.js';

// Cổng nhà cung cấp AI (chatbot P1; PLAN 5.5). Cổng chỉ chuyển hình dạng yêu cầu và phản hồi: lược đồ đầu ra thật, lời nhắc hệ thống
// và ngữ cảnh là việc của chatbot B2, B3; P1 chỉ NHẬN chúng trong `AiRequest`.

export type ProviderName = 'groq' | 'gemini';

/** Sáu loại hỏng của một lần gọi (PLAN 5.5). Bảng loại hỏng quyết định thử lại và cooldown ở `fallback-chain.ts`. */
export type ProviderFailure =
  'timeout' | 'network' | 'server' | 'rateLimited' | 'rejected' | 'badOutput';

/** Một lượt trong lịch sử. Câu hỏi và lịch sử gửi vào đây đã được che định danh (việc của chatbot B1). */
export interface AiTurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/**
 * Lược đồ đầu ra do chatbot B2 cung cấp; P1 chỉ chuyển đi và dùng `isValid` để phân loại `badOutput` ("sai lược đồ", HDA-04)
 * mà không cần thư viện kiểm lược đồ. Groq `strict: true` đòi: mọi trường nằm trong `required` và mọi đối tượng có `additionalProperties: false`
 * (console.groq.com/docs/structured-outputs, tra 27/11/2026).
 */
export interface AiOutputSchema<T> {
  /** Tên lược đồ (`json_schema.name` của Groq). */
  readonly name: string;
  /** JSON Schema gửi cho nhà cung cấp. */
  readonly jsonSchema: Readonly<Record<string, unknown>>;
  /** Kiểm giá trị đã `JSON.parse` có đúng lược đồ không. */
  readonly isValid: (value: unknown) => value is T;
}

export interface AiRequest<T> {
  readonly systemPrompt: string;
  readonly context: string;
  readonly history: readonly AiTurn[];
  readonly question: string;
  readonly output: AiOutputSchema<T>;
  /** Trần token đầu ra. */
  readonly maxOutputTokens: number;
}

/** Chữ thô nhà cung cấp trả về (chuỗi JSON); chưa `JSON.parse`. Chưa có `usage` (duyệt D4). */
export interface AiRawAnswer {
  readonly text: string;
}

export interface AiProvider {
  readonly name: ProviderName;
  /** Có khoá VÀ `AI_ENABLED`. Lớp chưa cấu hình bị chuỗi bỏ qua, không bao giờ được gọi. */
  readonly configured: boolean;
  /** Ném `ProviderError` khi hỏng. `signal` bị huỷ khi hết thời gian chờ của lần thử. */
  generate(
    request: AiRequest<unknown>,
    signal: AbortSignal,
  ): Promise<AiRawAnswer>;
}

/** Đồng hồ tiêm vào được để test không chờ thật (HDA-08, HDA-09). */
export interface Clock {
  /** Mili giây. */
  now(): number;
  /** Hẹn giờ gọi `callback` sau `ms`; trả hàm huỷ hẹn giờ. */
  setTimer(callback: () => void, ms: number): () => void;
}

export const SYSTEM_CLOCK: Clock = {
  now: () => nowVN().getTime(),
  setTimer: (callback, ms) => {
    const handle = setTimeout(callback, ms);
    return () => clearTimeout(handle);
  },
};

/** Lời nhắc hệ thống và ngữ cảnh gộp thành MỘT chuỗi hệ thống (cả hai nhà cung cấp dùng chung, nên có hàm này). */
export function composeSystemText(request: AiRequest<unknown>): string {
  return [request.systemPrompt, request.context]
    .filter((part) => part !== '')
    .join('\n\n');
}
