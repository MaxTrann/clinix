import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { AI_CLOCK, AI_CONFIG, AI_PROVIDERS } from './chatbot.constants.js';
import {
  findDeprecatedModels,
  readChatbotConfig,
  type ChatbotConfig,
} from './config/chatbot.config.js';
import {
  SYSTEM_CLOCK,
  type AiProvider,
  type Clock,
} from './providers/ai-provider.js';
import {
  FallbackChain,
  chainSettingsFromConfig,
} from './providers/fallback-chain.js';
import { FetchHttpTransport } from './providers/http-transport.js';
import { createAiProviders } from './providers/provider-factory.js';

type Env = ConfigService<EnvironmentVariables, true>;

// Module "Trợ lý AI" (scope #12). chatbot P1: nền ở máy chủ, CHƯA có controller (API hỏi đáp là chatbot B3).
// Export `FallbackChain` để B3 gọi. Không có khoá nào thì module vẫn dựng được và chuỗi trả `fallback` ngay (CFG-02).
@Module({
  providers: [
    {
      provide: AI_CONFIG,
      inject: [ConfigService],
      useFactory: (config: Env): ChatbotConfig => {
        const chatbot = readChatbotConfig({
          AI_ENABLED: config.get('AI_ENABLED', { infer: true }),
          GROQ_API_KEY: config.get('GROQ_API_KEY', { infer: true }),
          GEMINI_API_KEY: config.get('GEMINI_API_KEY', { infer: true }),
          GROQ_MODEL: config.get('GROQ_MODEL', { infer: true }),
          GEMINI_MODEL: config.get('GEMINI_MODEL', { infer: true }),
          GROQ_BASE_URL: config.get('GROQ_BASE_URL', { infer: true }),
          GEMINI_BASE_URL: config.get('GEMINI_BASE_URL', { infer: true }),
          AI_GROQ_TIMEOUT_MS: config.get('AI_GROQ_TIMEOUT_MS', { infer: true }),
          AI_GEMINI_TIMEOUT_MS: config.get('AI_GEMINI_TIMEOUT_MS', {
            infer: true,
          }),
          AI_TOTAL_TIMEOUT_MS: config.get('AI_TOTAL_TIMEOUT_MS', {
            infer: true,
          }),
          AI_COOLDOWN_SECONDS: config.get('AI_COOLDOWN_SECONDS', {
            infer: true,
          }),
          AI_IP_PER_MINUTE: config.get('AI_IP_PER_MINUTE', { infer: true }),
          AI_IP_PER_DAY: config.get('AI_IP_PER_DAY', { infer: true }),
          AI_MAX_CONCURRENT: config.get('AI_MAX_CONCURRENT', { infer: true }),
          AI_GROQ_PER_MINUTE: config.get('AI_GROQ_PER_MINUTE', { infer: true }),
          AI_GEMINI_PER_MINUTE: config.get('AI_GEMINI_PER_MINUTE', {
            infer: true,
          }),
        });
        // Model đã ngừng: khởi động được, chỉ cảnh báo (T4, R1). Thông điệp không có khoá.
        const logger = new Logger('ChatbotModule');
        for (const warning of findDeprecatedModels(chatbot)) {
          logger.warn(warning);
        }
        return chatbot;
      },
    },
    { provide: AI_CLOCK, useValue: SYSTEM_CLOCK },
    {
      provide: AI_PROVIDERS,
      inject: [AI_CONFIG, ConfigService],
      useFactory: (chatbot: ChatbotConfig, config: Env): AiProvider[] => {
        const nodeEnv = config.get('NODE_ENV', { infer: true });
        const providers = createAiProviders({
          config: chatbot,
          nodeEnv,
          transport: new FetchHttpTransport(),
        });
        // Test tự động không in dòng này (mỗi lần dựng AppModule sẽ lặp lại)
        if (nodeEnv !== 'test') {
          const active = providers
            .filter((provider) => provider.configured)
            .map((provider) => provider.name);
          new Logger('ChatbotModule').log(
            active.length > 0
              ? `Trợ lý AI: lớp đã cấu hình: ${active.join(', ')}.`
              : 'Trợ lý AI: chưa có lớp nào được cấu hình, sẽ trả câu dựng sẵn.',
          );
        }
        return providers;
      },
    },
    {
      provide: FallbackChain,
      inject: [AI_PROVIDERS, AI_CONFIG, AI_CLOCK],
      useFactory: (
        providers: AiProvider[],
        chatbot: ChatbotConfig,
        clock: Clock,
      ) =>
        new FallbackChain(
          providers,
          chainSettingsFromConfig(chatbot),
          clock,
          new Logger(FallbackChain.name),
        ),
    },
  ],
  exports: [FallbackChain, AI_CONFIG],
})
export class ChatbotModule {}
