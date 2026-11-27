import 'reflect-metadata';
import { Global, Logger, Module, RequestMethod } from '@nestjs/common';
import {
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { TEST_AUTH_ENV } from '../../auth/testing/auth-test-env.js';
import { fakeSecretValue } from '../../common/testing/sample-secrets.js';
import { validateEnv } from '../../config/env.validation.js';
import { AI_CONFIG } from '../chatbot.constants.js';
import { ChatbotModule } from '../chatbot.module.js';
import { SuggestionController } from '../suggest/suggestion.controller.js';
import { FallbackChain } from '../providers/fallback-chain.js';
import { isValidCanary } from '../answer/system-prompt.js';
import { AskController } from './ask.controller.js';
import { AskService } from './ask.service.js';
import { ASK_PROMPT, type AskPrompt } from './ask.tokens.js';
import { RequestLimiter } from '../limit/request-limiter.js';

// chatbot B3 — nối module và đặc tính route (không cần DB): 5.3 (route công khai, không đọc token, không @Roles), TLA-11 phần header, CFG-02/03 (không gọi mạng),
// mã chim mồi sinh MỖI LẦN KHỞI ĐỘNG. Mã ca bổ sung `B3-Wnn`. Cùng nếp `suggest.wiring.spec.ts` và `chatbot.module.spec.ts` (ConfigService và DataSource giả).

const moduleMeta = <T>(key: string): T[] =>
  (Reflect.getMetadata(key, ChatbotModule) as T[] | undefined) ?? [];

const VALID = {
  MYSQL_DATABASE: 'clinix',
  MYSQL_USER: 'clinix',
  MYSQL_PASSWORD: 'mat-khau-gia',
  ...TEST_AUTH_ENV,
};

@Global()
@Module({
  providers: [{ provide: DataSource, useValue: {} }],
  exports: [DataSource],
})
class FakeDatabaseModule {}

async function compile(extraEnv: Record<string, unknown> = {}) {
  const env = validateEnv({
    ...VALID,
    NODE_ENV: 'test',
    ...extraEnv,
  }) as unknown as Record<string, unknown>;
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      FakeDatabaseModule,
      ChatbotModule,
    ],
  })
    .overrideProvider(ConfigService)
    .useValue({ get: (key: string) => env[key] })
    .compile();
}

describe('B3-W1 ChatbotModule nối đúng (chỉ THÊM, phần của P1 và B4 giữ nguyên)', () => {
  it('có cả SuggestionController (B4) và AskController (B3)', () => {
    expect(moduleMeta('controllers')).toEqual([
      SuggestionController,
      AskController,
    ]);
  });

  it('vẫn chỉ xuất FallbackChain và AI_CONFIG (B3 không mở thêm gì ra ngoài)', () => {
    expect(moduleMeta('exports')).toEqual([FallbackChain, AI_CONFIG]);
  });
});

describe('B3-W2 route POST /chatbot/messages', () => {
  const handlerOf = (name: string): object =>
    Reflect.get(AskController.prototype, name) as object;
  const handler = handlerOf('ask');

  it('đường dẫn `chatbot` + `messages`, phương thức POST, và chỉ một route trong controller', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AskController)).toBe('chatbot');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('messages');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    const routes = Object.getOwnPropertyNames(AskController.prototype).filter(
      (name) =>
        name !== 'constructor' &&
        Reflect.getMetadata(METHOD_METADATA, handlerOf(name)) !== undefined,
    );
    expect(routes).toEqual(['ask']);
  });

  it('TLA-11: @Public() (không đọc token) và KHÔNG có @Roles', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, AskController)).toBe(true);
    expect(Reflect.getMetadata(ROLES_KEY, AskController)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toBeUndefined();
  });

  it('TLA-01: trả 200 (POST mặc định là 201) và Cache-Control: no-store đặt bằng @Header trên handler', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    const headers = Reflect.getMetadata(HEADERS_METADATA, handler) as
      { name: string; value: string }[] | undefined;
    expect(headers).toEqual([{ name: 'Cache-Control', value: 'no-store' }]);
  });
});

describe('B3-W3 đồ thị Nest dựng được với DataSource giả', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('CFG-02: không khoá nào ⇒ AskController, AskService, RequestLimiter, FallbackChain đều dựng được; không gọi mạng', async () => {
    const fetchStub = vi.fn(() => {
      throw new Error('fetch bị cấm trong test');
    });
    vi.stubGlobal('fetch', fetchStub);
    try {
      const moduleRef = await compile();
      expect(moduleRef.get(AskController)).toBeInstanceOf(AskController);
      expect(moduleRef.get(AskService)).toBeInstanceOf(AskService);
      expect(moduleRef.get(RequestLimiter)).toBeInstanceOf(RequestLimiter);
      expect(fetchStub).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('B3-W4: RequestLimiter lấy con số từ cấu hình (AI_IP_PER_MINUTE, AI_MAX_CONCURRENT), không dùng số cố định', async () => {
    const moduleRef = await compile({
      AI_IP_PER_MINUTE: '2',
      AI_MAX_CONCURRENT: '1',
    });
    const limiter = moduleRef.get(RequestLimiter);
    expect(limiter.checkIp('1.1.1.1').allowed).toBe(true);
    expect(limiter.checkIp('1.1.1.1').allowed).toBe(true);
    expect(limiter.checkIp('1.1.1.1').allowed).toBe(false);
    const first = limiter.withSlot(() => new Promise<void>(() => undefined));
    const second = await limiter.withSlot(() => Promise.resolve(1));
    expect(second).toEqual({ acquired: false });
    void first;
  });

  it('B3-W5: mã chim mồi chỉ chữ cái (≥ 8), có trong lời nhắc đúng một lần và KHÁC nhau giữa hai lần khởi động', async () => {
    const first = (await compile()).get<AskPrompt>(ASK_PROMPT);
    const second = (await compile()).get<AskPrompt>(ASK_PROMPT);
    for (const prompt of [first, second]) {
      expect(isValidCanary(prompt.canary)).toBe(true);
      expect(prompt.systemPrompt.split(prompt.canary)).toHaveLength(2);
    }
    expect(first.canary).not.toBe(second.canary);
  });

  it('CFG-03: NODE_ENV=test kèm khoá giả ⇒ vẫn không có provider thật, câu hỏi nhận câu dựng sẵn (DuPhong) mà không gọi mạng', async () => {
    const fetchStub = vi.fn(() => {
      throw new Error('fetch bị cấm trong test');
    });
    vi.stubGlobal('fetch', fetchStub);
    try {
      const moduleRef = await compile({
        GROQ_API_KEY: fakeSecretValue('groq'),
        GEMINI_API_KEY: fakeSecretValue('gemini'),
      });
      const chain = moduleRef.get(FallbackChain);
      await expect(
        chain.run({
          systemPrompt: 'a',
          context: 'b',
          history: [],
          question: 'c',
          output: {
            name: 'x',
            jsonSchema: {},
            isValid: (value): value is unknown => value !== undefined,
          },
          maxOutputTokens: 10,
        }),
      ).resolves.toEqual({ kind: 'fallback' });
      expect(fetchStub).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
