import { TEST_AUTH_ENV } from '../../auth/testing/auth-test-env.js';
import { fakeSecretValue } from '../../common/testing/sample-secrets.js';
import { validateEnv } from '../../config/env.validation.js';
import { readChatbotConfig } from '../config/chatbot.config.js';
import { FakeHttpTransport } from '../testing/fake-http-transport.js';
import { createAiProviders } from './provider-factory.js';

// chatbot P1 — CFG-03 mức nhà máy (PLAN 7.2; T11; đột biến 6): NODE_ENV=test thì KHÔNG bao giờ tạo provider thật, dù có khoá.
// Mức module Nest của cùng ca ở chatbot.module.spec.ts.
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
const configFor = (extra: Record<string, unknown> = {}) =>
  readChatbotConfig(validateEnv({ ...VALID, ...KEYS, ...extra }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createAiProviders (chatbot P1)', () => {
  it('CFG-03: NODE_ENV=test kèm khoá giả ⇒ nhà máy KHÔNG tạo provider nào và không chạm transport hay fetch', () => {
    const fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);
    const transport = new FakeHttpTransport([]);

    const providers = createAiProviders({
      config: configFor(),
      nodeEnv: 'test',
      transport,
    });

    expect(providers).toEqual([]);
    expect(transport.requests).toHaveLength(0);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it.each(['development', 'staging', 'production'])(
    'CFG-03 (đối chứng): NODE_ENV=%s kèm khoá ⇒ có hai provider theo thứ tự Groq, Gemini, đều configured',
    (nodeEnv) => {
      const providers = createAiProviders({
        config: configFor(),
        nodeEnv,
        transport: new FakeHttpTransport([]),
      });
      expect(providers.map((p) => [p.name, p.configured])).toEqual([
        ['groq', true],
        ['gemini', true],
      ]);
    },
  );

  it('HDA-10: AI_ENABLED=false dù có khoá ⇒ hai provider đều chưa cấu hình', () => {
    const providers = createAiProviders({
      config: configFor({ AI_ENABLED: 'false' }),
      nodeEnv: 'development',
      transport: new FakeHttpTransport([]),
    });
    expect(providers.map((p) => p.configured)).toEqual([false, false]);
  });

  it('CFG-02: không có khoá ⇒ hai provider đều chưa cấu hình (chuỗi sẽ trả câu dựng sẵn)', () => {
    const providers = createAiProviders({
      config: readChatbotConfig(validateEnv({ ...VALID })),
      nodeEnv: 'development',
      transport: new FakeHttpTransport([]),
    });
    expect(providers.map((p) => p.configured)).toEqual([false, false]);
  });

  it('chỉ có một khoá ⇒ chỉ lớp đó được cấu hình', () => {
    const providers = createAiProviders({
      config: readChatbotConfig(
        validateEnv({ ...VALID, GEMINI_API_KEY: KEYS.GEMINI_API_KEY }),
      ),
      nodeEnv: 'development',
      transport: new FakeHttpTransport([]),
    });
    expect(providers.map((p) => [p.name, p.configured])).toEqual([
      ['groq', false],
      ['gemini', true],
    ]);
  });
});
