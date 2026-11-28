import { TEST_AUTH_ENV } from '../auth/testing/auth-test-env.js';
import { fakeSecretValue } from '../common/testing/sample-secrets.js';
import { validateEnv } from './env.validation.js';

// chatbot P1 — CFG-01, CFG-02, CFG-04 (phần xác thực biến) của PLAN chatbot 7.2: khối biến `AI_…`, `GROQ_…`, `GEMINI_…` (PLAN 5.13).
// File riêng để không sửa env.validation.spec.ts của các task trước (cùng cách với env.validation.staff-activation.spec.ts).
const DB = {
  MYSQL_DATABASE: 'clinix',
  MYSQL_USER: 'clinix',
  MYSQL_PASSWORD: 'mat-khau-gia',
};
const VALID = { ...DB, ...TEST_AUTH_ENV };
// Staging/production bắt buộc có SMTP và Cloudinary (các task khác); chỉ để ca CFG-02 chạy được ở hai môi trường đó
const STAFF_OK = {
  CLOUDINARY_CLOUD_NAME: 'clinix-test',
  CLOUDINARY_API_KEY: 'test-key',
  CLOUDINARY_API_SECRET: fakeSecretValue('cloudinary'),
  SMTP_HOST: 'smtp.example.test',
  SMTP_USER: 'clinix@example.test',
  SMTP_PASS: fakeSecretValue('smtp'),
};

const messageOf = (config: Record<string, unknown>): string => {
  try {
    validateEnv(config);
  } catch (error) {
    return (error as Error).message;
  }
  return '';
};

describe('validateEnv: khối AI (chatbot P1)', () => {
  it('CFG-01: không đặt biến nào ⇒ đúng mặc định của PLAN 5.13', () => {
    const env = validateEnv({ ...VALID });
    expect(env.AI_ENABLED).toBe(true);
    expect(env.GROQ_API_KEY).toBeUndefined();
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.GROQ_MODEL).toBe('openai/gpt-oss-120b');
    expect(env.GEMINI_MODEL).toBe('gemini-3.5-flash-lite');
    expect(env.GROQ_BASE_URL).toBe('https://api.groq.com/openai/v1');
    expect(env.GEMINI_BASE_URL).toBe(
      'https://generativelanguage.googleapis.com/v1beta',
    );
    expect(env.AI_GROQ_TIMEOUT_MS).toBe(6000);
    expect(env.AI_GEMINI_TIMEOUT_MS).toBe(8000);
    expect(env.AI_TOTAL_TIMEOUT_MS).toBe(20_000);
    expect(env.AI_COOLDOWN_SECONDS).toBe(60);
    expect(env.AI_IP_PER_MINUTE).toBe(5);
    expect(env.AI_IP_PER_DAY).toBe(50);
    expect(env.AI_MAX_CONCURRENT).toBe(3);
    expect(env.AI_GROQ_PER_MINUTE).toBe(20);
    expect(env.AI_GEMINI_PER_MINUTE).toBe(10);
  });

  it('CFG-01: biến để TRỐNG (như `.env` chép từ `.env.example`) cũng là mặc định, kể cả biến số (khác STAFF_ACTIVATION_*)', () => {
    const env = validateEnv({
      ...VALID,
      AI_ENABLED: '',
      GROQ_API_KEY: '',
      GEMINI_API_KEY: '',
      GROQ_MODEL: '',
      GEMINI_MODEL: '',
      GROQ_BASE_URL: '',
      GEMINI_BASE_URL: '',
      AI_GROQ_TIMEOUT_MS: '',
      AI_GEMINI_TIMEOUT_MS: '',
      AI_TOTAL_TIMEOUT_MS: '',
      AI_COOLDOWN_SECONDS: '',
      AI_IP_PER_MINUTE: '',
      AI_IP_PER_DAY: '',
      AI_MAX_CONCURRENT: '',
      AI_GROQ_PER_MINUTE: '',
      AI_GEMINI_PER_MINUTE: '',
    });
    expect(env.AI_ENABLED).toBe(true);
    expect(env.GROQ_API_KEY).toBeUndefined();
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.GROQ_MODEL).toBe('openai/gpt-oss-120b');
    expect(env.GEMINI_BASE_URL).toBe(
      'https://generativelanguage.googleapis.com/v1beta',
    );
    expect(env.AI_GROQ_TIMEOUT_MS).toBe(6000);
    expect(env.AI_TOTAL_TIMEOUT_MS).toBe(20_000);
    expect(env.AI_GEMINI_PER_MINUTE).toBe(10);
  });

  it('CFG-01: giá trị đặt (chuỗi, như biến môi trường thật) được đổi sang kiểu đúng', () => {
    const groqKey = fakeSecretValue('groq');
    const env = validateEnv({
      ...VALID,
      AI_ENABLED: 'false',
      GROQ_API_KEY: groqKey,
      GROQ_MODEL: 'openai/gpt-oss-120b',
      GEMINI_MODEL: 'gemini-3.5-flash',
      AI_GROQ_TIMEOUT_MS: '7000',
      AI_GEMINI_TIMEOUT_MS: '9000',
      AI_TOTAL_TIMEOUT_MS: '30000',
      AI_COOLDOWN_SECONDS: '90',
      AI_IP_PER_MINUTE: '10',
      AI_IP_PER_DAY: '100',
      AI_MAX_CONCURRENT: '2',
      AI_GROQ_PER_MINUTE: '30',
      AI_GEMINI_PER_MINUTE: '15',
    });
    expect(env.AI_ENABLED).toBe(false); // chuỗi 'false' KHÔNG bị chuyển kiểu ngầm thành true
    expect(env.GROQ_API_KEY).toBe(groqKey);
    expect(env.GROQ_MODEL).toBe('openai/gpt-oss-120b');
    expect(env.AI_GROQ_TIMEOUT_MS).toBe(7000);
    expect(env.AI_GEMINI_TIMEOUT_MS).toBe(9000);
    expect(env.AI_TOTAL_TIMEOUT_MS).toBe(30_000);
    expect(env.AI_COOLDOWN_SECONDS).toBe(90);
    expect(env.AI_IP_PER_MINUTE).toBe(10);
    expect(env.AI_MAX_CONCURRENT).toBe(2);
    expect(env.AI_GEMINI_PER_MINUTE).toBe(15);
  });

  it.each(['development', 'test', 'staging', 'production'])(
    'CFG-02: không có khoá nào ở NODE_ENV=%s ⇒ cấu hình hợp lệ, API khởi động được',
    (nodeEnv) => {
      const staff = nodeEnv === 'staging' || nodeEnv === 'production';
      expect(() =>
        validateEnv({
          ...VALID,
          NODE_ENV: nodeEnv,
          ...(staff ? STAFF_OK : {}),
        }),
      ).not.toThrow();
    },
  );

  it('CFG-02: chỉ một khoá (Groq hoặc Gemini) cũng hợp lệ', () => {
    expect(() =>
      validateEnv({ ...VALID, GROQ_API_KEY: fakeSecretValue('groq') }),
    ).not.toThrow();
    expect(() =>
      validateEnv({ ...VALID, GEMINI_API_KEY: fakeSecretValue('gemini') }),
    ).not.toThrow();
  });

  it.each([
    ['AI_GROQ_TIMEOUT_MS', '-5'],
    ['AI_GROQ_TIMEOUT_MS', 'abc'],
    ['AI_GROQ_TIMEOUT_MS', '1.5'],
    ['AI_GROQ_TIMEOUT_MS', '1999'],
    ['AI_GROQ_TIMEOUT_MS', '30001'],
    ['AI_GEMINI_TIMEOUT_MS', '0'],
    ['AI_GEMINI_TIMEOUT_MS', '30001'],
    ['AI_TOTAL_TIMEOUT_MS', '45000'],
    ['AI_TOTAL_TIMEOUT_MS', '99999'],
    ['AI_TOTAL_TIMEOUT_MS', '1999'],
    ['AI_TOTAL_TIMEOUT_MS', '-1'],
    ['AI_COOLDOWN_SECONDS', '0'],
    ['AI_COOLDOWN_SECONDS', '3601'],
    ['AI_IP_PER_MINUTE', '0'],
    ['AI_IP_PER_MINUTE', '61'],
    ['AI_IP_PER_DAY', '10001'],
    ['AI_MAX_CONCURRENT', '0'],
    ['AI_MAX_CONCURRENT', '51'],
    ['AI_GROQ_PER_MINUTE', '601'],
    ['AI_GEMINI_PER_MINUTE', '0'],
    ['AI_ENABLED', 'yes'],
    ['AI_ENABLED', '1'],
    ['GROQ_MODEL', 'model có khoảng trắng'],
    ['GEMINI_MODEL', 'a b'],
    ['GROQ_MODEL', 'x'.repeat(101)],
    ['GROQ_BASE_URL', 'http://api.groq.com/openai/v1'],
    ['GROQ_BASE_URL', 'ftp://api.example.test/v1'],
    ['GROQ_BASE_URL', 'khong-phai-dia-chi'],
    ['GEMINI_BASE_URL', 'http://localhost.example.test/v1beta'],
    ['GEMINI_BASE_URL', 'http://127.0.0.1.example.test/v1beta'],
    ['GEMINI_BASE_URL', 'https://user:pw@example.test/v1beta'],
    ['GEMINI_BASE_URL', 'https://user@example.test/v1beta'],
    ['GEMINI_BASE_URL', 'https://example.test/v1beta?key=abc'],
    ['GEMINI_BASE_URL', 'https://example.test/v1beta?'],
    ['GEMINI_BASE_URL', 'https://example.test/v1beta#x'],
    ['GROQ_API_KEY', 'co khoang trang'],
    ['GEMINI_API_KEY', 'dong-mot\nnhan-hai'],
    ['GROQ_API_KEY', 'khoá-có-dấu'],
    ['GEMINI_API_KEY', 'x'.repeat(513)],
  ])(
    'CFG-04: %s = %j sai ⇒ API không khởi động và thông báo nêu TÊN biến',
    (name, value) => {
      expect(messageOf({ ...VALID, [name]: value })).toContain(name);
    },
  );

  it('CFG-04: thông báo lỗi KHÔNG chứa giá trị đã nhập (khoá, địa chỉ có mật khẩu, số sai)', () => {
    const secret = fakeSecretValue('gia-tri-bi-mat');
    const cases: Record<string, string> = {
      GROQ_API_KEY: `${secret} co khoang trang`,
      GEMINI_API_KEY: `${secret}\nxuong-dong`,
      GROQ_BASE_URL: `https://nguoi-dung:${secret}@example.test/v1`,
      GEMINI_BASE_URL: `http://example.test/${secret}`,
      AI_GROQ_TIMEOUT_MS: secret,
      AI_ENABLED: secret,
      GROQ_MODEL: `${secret} model`,
    };
    for (const [name, value] of Object.entries(cases)) {
      const message = messageOf({ ...VALID, [name]: value });
      expect(message, name).toContain(name);
      expect(message, name).not.toContain(secret);
    }
  });

  it('CFG-04: kiểm chéo "tổng < 45000": 44999 hợp lệ, 45000 thì không; tổng tối thiểu 2000 (đủ một lần thử)', () => {
    expect(
      validateEnv({ ...VALID, AI_TOTAL_TIMEOUT_MS: '44999' })
        .AI_TOTAL_TIMEOUT_MS,
    ).toBe(44_999);
    expect(
      validateEnv({ ...VALID, AI_TOTAL_TIMEOUT_MS: '2000' })
        .AI_TOTAL_TIMEOUT_MS,
    ).toBe(2000);
    expect(messageOf({ ...VALID, AI_TOTAL_TIMEOUT_MS: '45000' })).toContain(
      'AI_TOTAL_TIMEOUT_MS',
    );
    expect(messageOf({ ...VALID, AI_TOTAL_TIMEOUT_MS: '1999' })).toContain(
      'AI_TOTAL_TIMEOUT_MS',
    );
  });

  it('CFG-04: AI_IP_PER_MINUTE không được lớn hơn AI_IP_PER_DAY (bằng nhau thì được)', () => {
    expect(
      messageOf({ ...VALID, AI_IP_PER_MINUTE: '60', AI_IP_PER_DAY: '50' }),
    ).toContain('AI_IP_PER_MINUTE');
    expect(() =>
      validateEnv({ ...VALID, AI_IP_PER_MINUTE: '50', AI_IP_PER_DAY: '50' }),
    ).not.toThrow();
  });

  it.each(['development', 'test'])(
    'CFG-04: http://localhost và http://127.0.0.1 (máy chủ giả) được ở NODE_ENV=%s',
    (nodeEnv) => {
      const env = validateEnv({
        ...VALID,
        NODE_ENV: nodeEnv,
        GROQ_BASE_URL: 'http://localhost:8080/v1',
        GEMINI_BASE_URL: 'http://127.0.0.1:8081/v1beta',
      });
      expect(env.GROQ_BASE_URL).toBe('http://localhost:8080/v1');
    },
  );

  it.each(['staging', 'production'])(
    'CFG-04: http://localhost KHÔNG được ở NODE_ENV=%s (chỉ https)',
    (nodeEnv) => {
      const message = messageOf({
        ...VALID,
        ...STAFF_OK,
        NODE_ENV: nodeEnv,
        GROQ_BASE_URL: 'http://localhost:8080/v1',
      });
      expect(message).toContain('GROQ_BASE_URL');
    },
  );

  it('CFG-04: model đã ngừng (gemini-2.0-flash, llama-3.1-8b-instant) KHÔNG làm API dừng; cảnh báo nằm ở chatbot.config.spec.ts', () => {
    expect(() =>
      validateEnv({
        ...VALID,
        GROQ_MODEL: 'llama-3.1-8b-instant',
        GEMINI_MODEL: 'gemini-2.0-flash',
      }),
    ).not.toThrow();
  });
});
