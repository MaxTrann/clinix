import type { AiProvider } from '../providers/ai-provider.js';
import {
  FallbackChain,
  type ChainLogger,
  type ChainSettings,
} from '../providers/fallback-chain.js';
import { FakeClock } from './fake-clock.js';

// Bộ dựng dùng chung cho các spec của chuỗi dự phòng (fallback-chain.spec.ts, fallback-chain.deadline.spec.ts, chatbot.module.spec.ts).

/** Đúng giá trị mặc định của PLAN 5.13: Groq 6 giây, Gemini 8 giây, tổng 20 giây, cooldown 60 giây. */
export const SETTINGS: ChainSettings = {
  totalTimeoutMs: 20_000,
  cooldownMs: 60_000,
  layerTimeoutMs: { groq: 6000, gemini: 8000 },
  perMinute: { groq: 20, gemini: 10 },
};

/** Logger ghi lại các cảnh báo để test kiểm nội dung (không in ra màn hình). */
export class RecordingLogger implements ChainLogger {
  readonly messages: string[] = [];
  warn(message: string): void {
    this.messages.push(message);
  }
}

export function setup(
  providers: readonly AiProvider[],
  overrides: Partial<ChainSettings> = {},
) {
  const clock = new FakeClock();
  const logger = new RecordingLogger();
  const chain = new FallbackChain(
    providers,
    { ...SETTINGS, ...overrides },
    clock,
    logger,
  );
  return { chain, clock, logger };
}
