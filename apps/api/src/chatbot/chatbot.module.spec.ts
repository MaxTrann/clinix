import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TEST_AUTH_ENV } from '../auth/testing/auth-test-env.js';
import { fakeSecretValue } from '../common/testing/sample-secrets.js';
import { validateEnv } from '../config/env.validation.js';
import { AI_PROVIDERS } from './chatbot.constants.js';
import { ChatbotModule } from './chatbot.module.js';
import type { AiProvider } from './providers/ai-provider.js';
import { FallbackChain } from './providers/fallback-chain.js';
import { buildSampleRequest } from './testing/sample-request.js';

// chatbot P1 — CFG-02 (không có khoá nào thì module vẫn dựng được) và CFG-03 mức module Nest (NODE_ENV=test kèm khoá giả ⇒ không provider thật,
// `fetch` toàn cục không bị gọi). Mức nhà máy ở providers/provider-factory.spec.ts. ConfigService là bản giả đọc từ `validateEnv` thật.
const VALID = {
  MYSQL_DATABASE: 'clinix',
  MYSQL_USER: 'clinix',
  MYSQL_PASSWORD: 'mat-khau-gia',
  ...TEST_AUTH_ENV,
};
const KEYS = {
  GROQ_API_KEY: fakeSecretValue('groq'),
  GEMINI_API_KEY: fakeSecretValue('gemini'),
};

// chatbot B4: ChatbotModule nhập SearchModule, SchedulingModule, SystemConfigModule nên cần `DataSource` (app thật lấy từ DatabaseModule).
// Module toàn cục giả này chỉ để dựng đồ thị: không ca nào ở đây chạm DB (`compile()` không chạy `onApplicationBootstrap`).
@Global()
@Module({
  providers: [{ provide: DataSource, useValue: {} }],
  exports: [DataSource],
})
class FakeDatabaseModule {}

async function compile(extraEnv: Record<string, unknown>) {
  const env = validateEnv({ ...VALID, ...extraEnv }) as unknown as Record<
    string,
    unknown
  >;
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

let fetchStub: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchStub = vi.fn(() => {
    throw new Error('fetch bị cấm trong test');
  });
  vi.stubGlobal('fetch', fetchStub);
  // Nest in log của module qua Logger; giữ đầu ra test sạch và để kiểm nội dung
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ChatbotModule (chatbot P1)', () => {
  it('CFG-03: NODE_ENV=test kèm khoá giả ⇒ không có provider nào; chuỗi trả dự phòng; fetch toàn cục không bị gọi', async () => {
    const moduleRef = await compile({ NODE_ENV: 'test', ...KEYS });

    expect(moduleRef.get<AiProvider[]>(AI_PROVIDERS)).toEqual([]);
    const chain = moduleRef.get(FallbackChain);
    await expect(chain.run(buildSampleRequest())).resolves.toEqual({
      kind: 'fallback',
    });
    expect(fetchStub).not.toHaveBeenCalled();
    await moduleRef.close();
  });

  it('CFG-03 (đối chứng): NODE_ENV=development kèm khoá ⇒ có hai provider thật đã cấu hình (chưa gọi mạng)', async () => {
    const moduleRef = await compile({ NODE_ENV: 'development', ...KEYS });

    const providers = moduleRef.get<AiProvider[]>(AI_PROVIDERS);
    expect(providers.map((p) => [p.name, p.configured])).toEqual([
      ['groq', true],
      ['gemini', true],
    ]);
    expect(fetchStub).not.toHaveBeenCalled();
    await moduleRef.close();
  });

  it('CFG-02: không có khoá nào ⇒ module dựng được, chuỗi trả dự phòng ngay, không lời gọi mạng nào', async () => {
    const moduleRef = await compile({ NODE_ENV: 'development' });

    const chain = moduleRef.get(FallbackChain);
    await expect(chain.run(buildSampleRequest())).resolves.toEqual({
      kind: 'fallback',
    });
    expect(fetchStub).not.toHaveBeenCalled();
    await moduleRef.close();
  });

  it('CFG-04: model đã ngừng ⇒ module vẫn dựng được và ghi cảnh báo nêu tên biến; cảnh báo không có khoá', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const moduleRef = await compile({
      NODE_ENV: 'development',
      GROQ_MODEL: 'llama-3.1-8b-instant',
      ...KEYS,
    });

    const messages = warn.mock.calls.map(([message]) => String(message));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('GROQ_MODEL=llama-3.1-8b-instant');
    expect(messages.join('\n')).not.toContain(KEYS.GROQ_API_KEY);
    await moduleRef.close();
  });

  it('cấu hình mặc định không có cảnh báo model nào', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const moduleRef = await compile({ NODE_ENV: 'development' });

    expect(warn).not.toHaveBeenCalled();
    await moduleRef.close();
  });
});
