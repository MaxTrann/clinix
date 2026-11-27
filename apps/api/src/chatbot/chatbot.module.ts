import { randomInt } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { SystemConfigModule } from '../admin/system-config/system-config.module.js';
import { SystemConfigService } from '../admin/system-config/system-config.service.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { PublicDoctorService } from '../search/doctors/public-doctor.service.js';
import { SearchModule } from '../search/search.module.js';
import { AnswerReconciler } from './answer/answer-reconciler.js';
import { EntityResolver } from './answer/entity-resolver.js';
import { buildSystemPrompt, createCanary } from './answer/system-prompt.js';
import { AskController } from './ask/ask.controller.js';
import { AskService } from './ask/ask.service.js';
import { ASK_PROMPT, type AskPrompt } from './ask/ask.tokens.js';
import { BranchDirectory, createBranchLoader } from './ask/branch-directory.js';
import { AI_CLOCK, AI_CONFIG, AI_PROVIDERS } from './chatbot.constants.js';
import { ContextBuilder } from './context/context-builder.js';
import { PublicDoctorSourceAdapter } from './context/doctor-source.js';
import { PublicContextRepository } from './context/public-context.repository.js';
import { RequestLimiter } from './limit/request-limiter.js';
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
import { DoctorDegreeRepository } from './suggest/doctor-degree.repository.js';
import { SuggestionController } from './suggest/suggestion.controller.js';
import { SuggestionRepository } from './suggest/suggestion.repository.js';
import { SuggestionService } from './suggest/suggestion.service.js';

type Env = ConfigService<EnvironmentVariables, true>;

// Module "Trợ lý AI" (scope #12). chatbot P1: nền ở máy chủ, CHƯA có controller (API hỏi đáp là chatbot B3).
// Export `FallbackChain` để B3 gọi. Không có khoá nào thì module vẫn dựng được và chuỗi trả `fallback` ngay (CFG-02).
@Module({
  // chatbot B4 (API gợi ý, chỉ đọc): `PublicDoctorService` (search), `AvailableSlotsReader` (scheduling), `SystemConfigService` (admin)
  imports: [SearchModule, SchedulingModule, SystemConfigModule],
  controllers: [SuggestionController, AskController],
  providers: [
    SuggestionService,
    SuggestionRepository,
    DoctorDegreeRepository,
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
    // chatbot B3 (API hỏi đáp): các lớp thường của B1, B2 không có @Injectable nên dựng bằng useFactory (TRACKING 3.5, 3.6)
    {
      provide: RequestLimiter,
      inject: [AI_CONFIG, AI_CLOCK],
      useFactory: (chatbot: ChatbotConfig, clock: Clock) =>
        new RequestLimiter({
          ipPerMinute: chatbot.limits.ipPerMinute,
          ipPerDay: chatbot.limits.ipPerDay,
          maxConcurrent: chatbot.limits.maxConcurrent,
          now: () => clock.now(),
        }),
    },
    {
      provide: PublicContextRepository,
      inject: [DataSource],
      useFactory: (db: DataSource) => new PublicContextRepository(db),
    },
    {
      provide: PublicDoctorSourceAdapter,
      inject: [PublicDoctorService],
      useFactory: (doctors: PublicDoctorService) =>
        new PublicDoctorSourceAdapter(doctors),
    },
    {
      provide: ContextBuilder,
      inject: [
        PublicContextRepository,
        PublicDoctorSourceAdapter,
        SystemConfigService,
        AI_CLOCK,
      ],
      useFactory: (
        repository: PublicContextRepository,
        doctors: PublicDoctorSourceAdapter,
        config: SystemConfigService,
        clock: Clock,
      ) => new ContextBuilder({ base: repository, doctors, config, clock }),
    },
    {
      provide: EntityResolver,
      inject: [
        PublicContextRepository,
        PublicDoctorSourceAdapter,
        SystemConfigService,
      ],
      useFactory: (
        reader: PublicContextRepository,
        doctors: PublicDoctorSourceAdapter,
        config: SystemConfigService,
      ) => new EntityResolver({ reader, doctors, config }),
    },
    {
      provide: AnswerReconciler,
      inject: [EntityResolver, PublicContextRepository],
      useFactory: (
        resolver: EntityResolver,
        specialties: PublicContextRepository,
      ) => new AnswerReconciler({ resolver, specialties }),
    },
    {
      provide: BranchDirectory,
      inject: [DataSource, AI_CLOCK],
      useFactory: (db: DataSource, clock: Clock) =>
        new BranchDirectory({ load: createBranchLoader(db), clock }),
    },
    {
      // Mã chim mồi sinh bằng nguồn ngẫu nhiên thật MỖI LẦN KHỞI ĐỘNG (chỉ chữ cái, 16 ký tự); lời nhắc dựng một lần
      provide: ASK_PROMPT,
      useFactory: (): AskPrompt => {
        const canary = createCanary((max) => randomInt(max));
        return { canary, systemPrompt: buildSystemPrompt(canary) };
      },
    },
    {
      provide: AskService,
      inject: [
        RequestLimiter,
        ContextBuilder,
        FallbackChain,
        AnswerReconciler,
        BranchDirectory,
        ASK_PROMPT,
        AI_CLOCK,
      ],
      useFactory: (
        limiter: RequestLimiter,
        context: ContextBuilder,
        chain: FallbackChain,
        reconciler: AnswerReconciler,
        branches: BranchDirectory,
        prompt: AskPrompt,
        clock: Clock,
      ) =>
        new AskService({
          limiter,
          context,
          chain,
          reconciler,
          branches,
          prompt,
          clock,
          logger: new Logger(AskService.name),
        }),
    },
  ],
  exports: [FallbackChain, AI_CONFIG],
})
export class ChatbotModule {}
