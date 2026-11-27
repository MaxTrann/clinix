// Token DI riêng của API hỏi đáp (chatbot B3). Không đặt trong `chatbot.constants.ts` (của P1).

export const ASK_PROMPT = Symbol('ASK_PROMPT');

/** Lời nhắc hệ thống và mã chim mồi của lần khởi động này. `protectedPrompt` của luật V9 chính là `systemPrompt`. */
export interface AskPrompt {
  readonly canary: string;
  readonly systemPrompt: string;
}
