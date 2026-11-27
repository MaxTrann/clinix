import type { ChatbotConfig } from '../config/chatbot.config.js';
import type { AiProvider } from './ai-provider.js';
import { GeminiProvider } from './gemini.provider.js';
import { GroqProvider } from './groq.provider.js';
import type { HttpTransport } from './http-transport.js';

export interface ProviderFactoryInput {
  readonly config: ChatbotConfig;
  readonly nodeEnv: string;
  readonly transport: HttpTransport;
}

/**
 * Nhà máy provider, theo thứ tự lớp: Groq rồi Gemini (Q1).
 * `NODE_ENV=test` thì KHÔNG tạo provider nào, dù có khoá (CFG-03, T11): CI không có khoá và không bao giờ gọi AI thật.
 * Test cần một lớp thì tự dựng `FakeProvider` hay adapter với transport giả. Đây là chỗ DUY NHẤT tạo adapter thật.
 */
export function createAiProviders(input: ProviderFactoryInput): AiProvider[] {
  const { config, nodeEnv, transport } = input;
  if (nodeEnv === 'test') return [];
  return [
    new GroqProvider({ enabled: config.enabled, ...config.groq }, transport),
    new GeminiProvider(
      { enabled: config.enabled, ...config.gemini },
      transport,
    ),
  ];
}
