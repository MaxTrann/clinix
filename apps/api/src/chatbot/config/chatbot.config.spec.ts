import { TEST_AUTH_ENV } from '../../auth/testing/auth-test-env.js';
import {
  REDACTED,
  collectSecretValues,
} from '../../common/logging/sanitize.js';
import { createAppLogger } from '../../common/logging/sanitizing.logger.js';
import { fakeSecretValue } from '../../common/testing/sample-secrets.js';
import { validateEnv } from '../../config/env.validation.js';
import { SETTINGS } from '../testing/chain-test-kit.js';
import { chainSettingsFromConfig } from '../providers/fallback-chain.js';
import {
  findDeprecatedModels,
  readChatbotConfig,
  type ChatbotConfig,
} from './chatbot.config.js';

// chatbot P1 — CFG-01 (mặc định), CFG-04 (cảnh báo model đã ngừng; khoá bị che trong log) của PLAN chatbot 7.2.
const VALID = {
  MYSQL_DATABASE: 'clinix',
  MYSQL_USER: 'clinix',
  MYSQL_PASSWORD: 'mat-khau-gia',
  ...TEST_AUTH_ENV,
};
const configFor = (extra: Record<string, unknown> = {}): ChatbotConfig =>
  readChatbotConfig(validateEnv({ ...VALID, ...extra }));

// Giá trị gõ thẳng từ PLAN 5.13 (không đọc lại từ hằng của mã) để ca này bắt được việc sửa nhầm mặc định
const DEFAULT_CONFIG = {
  enabled: true,
  totalTimeoutMs: 20_000,
  cooldownMs: 60_000,
  groq: {
    model: 'openai/gpt-oss-20b',
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

function captureOutput(): () => string {
  const chunks: string[] = [];
  const capture = (chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, 'write').mockImplementation(capture);
  vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  return () => chunks.join('');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readChatbotConfig (chatbot P1)', () => {
  it('CFG-01: không đặt biến ⇒ cấu hình đúng bảng mặc định của PLAN 5.13, và không có khoá', () => {
    const config = configFor();
    expect(config).toStrictEqual(DEFAULT_CONFIG);
    expect('apiKey' in config.groq).toBe(false);
    expect('apiKey' in config.gemini).toBe(false);
  });

  it('CFG-01: giá trị đặt thay mặc định; giây đổi sang mili giây; dấu / cuối địa chỉ bị bỏ', () => {
    const groqKey = fakeSecretValue('groq');
    const config = configFor({
      AI_ENABLED: 'false',
      GROQ_API_KEY: groqKey,
      GEMINI_MODEL: 'gemini-3.5-flash',
      GROQ_BASE_URL: 'https://groq.example.test/v1///',
      AI_COOLDOWN_SECONDS: '90',
      AI_TOTAL_TIMEOUT_MS: '30000',
      AI_GEMINI_PER_MINUTE: '15',
    });
    expect(config.enabled).toBe(false);
    expect(config.groq.apiKey).toBe(groqKey);
    expect(config.groq.baseUrl).toBe('https://groq.example.test/v1');
    expect(config.gemini.model).toBe('gemini-3.5-flash');
    expect(config.gemini.perMinute).toBe(15);
    expect(config.cooldownMs).toBe(90_000);
    expect(config.totalTimeoutMs).toBe(30_000);
  });

  it('CFG-01: `chainSettingsFromConfig` của cấu hình mặc định đúng 6 + 8 giây, tổng 20 giây, cooldown 60 giây, 20 và 10 lời gọi mỗi phút', () => {
    expect(chainSettingsFromConfig(configFor())).toEqual(SETTINGS);
  });
});

describe('findDeprecatedModels (chatbot P1)', () => {
  it('CFG-04: cấu hình mặc định không có cảnh báo', () => {
    expect(findDeprecatedModels(configFor())).toEqual([]);
  });

  it('CFG-04: model đã ngừng ⇒ khởi động được và có cảnh báo nêu tên biến, tên model, ngày ngừng', () => {
    const config = configFor({
      GROQ_MODEL: 'llama-3.1-8b-instant',
      GEMINI_MODEL: 'gemini-2.0-flash',
    });
    const warnings = findDeprecatedModels(config);

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('GROQ_MODEL=llama-3.1-8b-instant');
    expect(warnings[0]).toContain('16/08/2026');
    expect(warnings[1]).toContain('GEMINI_MODEL=gemini-2.0-flash');
    expect(warnings[1]).toContain('01/06/2026');
  });

  it('CFG-04: model đã ngừng của lớp NÀY đặt nhầm sang lớp kia thì không bị coi là ngừng (so theo từng nhà cung cấp)', () => {
    expect(
      findDeprecatedModels(configFor({ GROQ_MODEL: 'gemini-2.0-flash' })),
    ).toEqual([]);
  });

  it('CFG-04: cảnh báo không bao giờ chứa khoá', () => {
    const key = fakeSecretValue('groq');
    const warnings = findDeprecatedModels(
      configFor({ GROQ_MODEL: 'llama-3.1-8b-instant', GROQ_API_KEY: key }),
    );
    expect(warnings.join('\n')).not.toContain(key);
  });
});

describe('Che khoá AI khỏi log (CFG-04)', () => {
  const groqKey = fakeSecretValue('groq');
  const geminiKey = fakeSecretValue('gemini');

  it('collectSecretValues lấy đúng GROQ_API_KEY và GEMINI_API_KEY (theo tên biến), không lấy model, địa chỉ hay số', () => {
    const secrets = collectSecretValues({
      GROQ_API_KEY: groqKey,
      GEMINI_API_KEY: geminiKey,
      GROQ_MODEL: 'openai/gpt-oss-20b',
      GEMINI_MODEL: 'gemini-3.5-flash-lite',
      GROQ_BASE_URL: 'https://api.groq.com/openai/v1',
      AI_TOTAL_TIMEOUT_MS: '20000',
      AI_ENABLED: 'true',
    });
    expect(secrets.sort()).toEqual([geminiKey, groqKey].sort());
  });

  it('logger của ứng dụng che hai khoá trong chuỗi, đối tượng và Error', () => {
    const output = captureOutput();
    const logger = createAppLogger({
      GROQ_API_KEY: groqKey,
      GEMINI_API_KEY: geminiKey,
    });

    logger.warn(`gọi Groq lỗi với ${groqKey}`);
    logger.log({ ghiChu: `khoá Gemini là ${geminiKey}` });
    logger.error(new Error(`401 khi dùng ${geminiKey}`));

    expect(output()).not.toContain(groqKey);
    expect(output()).not.toContain(geminiKey);
    expect(output()).toContain(REDACTED);
  });

  it('lớp phòng thủ THỨ HAI: header Authorization và x-goog-api-key bị che theo tên khoá dù logger không biết giá trị', () => {
    const output = captureOutput();
    const logger = createAppLogger({}); // không có danh sách bí mật

    logger.warn({
      headers: {
        Authorization: `Bearer ${groqKey}`,
        'x-goog-api-key': geminiKey,
      },
    });

    expect(output()).not.toContain(groqKey);
    expect(output()).not.toContain(geminiKey);
  });
});
