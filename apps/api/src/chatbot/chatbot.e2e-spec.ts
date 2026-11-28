import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { fakeSecretValue } from '../common/testing/sample-secrets.js';

// chatbot P1 — CFG-02, CFG-03, CFG-04 qua AppModule THẬT (ConfigModule và validateEnv thật; spec module chatbot.module.spec.ts dùng ConfigService giả).
// Cần MySQL (xem vitest.config.e2e.ts): chạy bằng `npm run test:e2e` hay lọc theo tên file. Chỉ đọc biến môi trường của tiến trình,
// KHÔNG phụ thuộc DB nào cụ thể. `ConfigModule.forRoot` kiểm biến NGAY LÚC nạp app.module, nên mỗi ca đặt biến rồi nạp lại module.
//
// Mỗi ca nạp lại cả đồ thị module nên mọi giá trị dùng chung với app (token, lớp FallbackChain) cũng phải nạp lại sau `resetModules`.
const DEFAULT_CONFIG = {
  enabled: true,
  totalTimeoutMs: 20_000,
  cooldownMs: 60_000,
  groq: {
    model: 'openai/gpt-oss-120b',
    baseUrl: 'https://api.groq.com/openai/v1',
    timeoutMs: 6000,
    perMinute: 20,
  },
  gemini: {
    model: 'gemini-3.5-flash-lite',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    timeoutMs: 8000,
    perMinute: 10,
  },
  limits: { ipPerMinute: 5, ipPerDay: 50, maxConcurrent: 3 },
};
const AI_VARIABLES = [
  'AI_ENABLED',
  'GROQ_API_KEY',
  'GEMINI_API_KEY',
  'GROQ_MODEL',
  'GEMINI_MODEL',
  'GROQ_BASE_URL',
  'GEMINI_BASE_URL',
  'AI_GROQ_TIMEOUT_MS',
  'AI_GEMINI_TIMEOUT_MS',
  'AI_TOTAL_TIMEOUT_MS',
  'AI_COOLDOWN_SECONDS',
  'AI_IP_PER_MINUTE',
  'AI_IP_PER_DAY',
  'AI_MAX_CONCURRENT',
  'AI_GROQ_PER_MINUTE',
  'AI_GEMINI_PER_MINUTE',
];

// Đưa process.env về đúng như lúc chụp: xoá biến mới xuất hiện, trả lại giá trị đã đổi
function restoreProcessEnv(before: NodeJS.ProcessEnv): void {
  for (const name of Object.keys(process.env)) {
    if (!(name in before)) delete process.env[name];
  }
  for (const [name, value] of Object.entries(before)) {
    if (value !== undefined) process.env[name] = value;
  }
}

describe('Nền Trợ lý AI qua AppModule (chatbot P1, e2e)', () => {
  let app: NestExpressApplication | undefined;
  let fetchStub: ReturnType<typeof vi.fn>;
  let envBefore: NodeJS.ProcessEnv = {};

  // Đặt biến (undefined = bỏ hẳn biến), nạp lại module, dựng app thật như main.ts
  async function bootApp(env: Record<string, string | undefined> = {}) {
    for (const name of AI_VARIABLES) vi.stubEnv(name, undefined);
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    vi.resetModules();
    const { AppModule } = await import('../app.module.js');
    const { configureApp } = await import('../app.setup.js');
    const tokens = await import('./chatbot.constants.js');
    const { FallbackChain } = await import('./providers/fallback-chain.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    return {
      config: app.get(tokens.AI_CONFIG, { strict: false }) as unknown,
      providers: app.get(tokens.AI_PROVIDERS, { strict: false }) as unknown[],
      chain: app.get(FallbackChain, { strict: false }),
    };
  }

  beforeEach(() => {
    // Chụp biến môi trường: `ConfigModule.forRoot` còn GHI giá trị mặc định đã kiểm vào process.env, nên chỉ `unstubAllEnvs` chưa đủ
    // để không biến nào (nhất là biến AI) lọt sang file e2e khác
    envBefore = { ...process.env };
    // Mọi lời gọi mạng ra ngoài đều là lỗi của test
    fetchStub = vi.fn(() => {
      throw new Error('fetch bị cấm trong e2e');
    });
    vi.stubGlobal('fetch', fetchStub);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    restoreProcessEnv(envBefore);
  });

  it('CFG-02: không đặt biến AI nào ⇒ AppModule khởi động; cấu hình đúng mặc định qua ConfigService thật; chuỗi trả dự phòng; không lời gọi mạng', async () => {
    const { config, providers, chain } = await bootApp();
    const { buildSampleRequest } = await import('./testing/sample-request.js');

    expect(config).toStrictEqual(DEFAULT_CONFIG);
    expect(providers).toEqual([]); // NODE_ENV=test
    await expect(chain.run(buildSampleRequest())).resolves.toEqual({
      kind: 'fallback',
    });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('CFG-03: NODE_ENV=test kèm khoá giả ⇒ AppModule khởi động, khoá được đọc đúng nhưng KHÔNG có provider nào; fetch không bị gọi', async () => {
    const groqKey = fakeSecretValue('groq');
    const { config, providers, chain } = await bootApp({
      GROQ_API_KEY: groqKey,
      GEMINI_API_KEY: fakeSecretValue('gemini'),
    });
    const { buildSampleRequest } = await import('./testing/sample-request.js');

    expect((config as { groq: { apiKey?: string } }).groq.apiKey).toBe(groqKey);
    expect(providers).toEqual([]);
    await expect(chain.run(buildSampleRequest())).resolves.toEqual({
      kind: 'fallback',
    });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('CFG-04: giá trị sai ⇒ AppModule KHÔNG khởi động và thông báo nêu TÊN biến, không có giá trị', async () => {
    const secret = fakeSecretValue('gia-tri-sai');
    const error: unknown = await bootApp({
      AI_TOTAL_TIMEOUT_MS: '45000',
      GROQ_API_KEY: `${secret} co khoang trang`,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain('AI_TOTAL_TIMEOUT_MS');
    expect(message).toContain('GROQ_API_KEY');
    expect(message).not.toContain(secret);
  });

  it('CFG-04: model đã ngừng ⇒ AppModule khởi động được (chỉ cảnh báo)', async () => {
    const { config } = await bootApp({ GROQ_MODEL: 'llama-3.1-8b-instant' });
    expect((config as { groq: { model: string } }).groq.model).toBe(
      'llama-3.1-8b-instant',
    );
  });
});
