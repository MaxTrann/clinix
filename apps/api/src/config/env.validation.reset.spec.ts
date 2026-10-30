import { TEST_AUTH_ENV } from '../auth/testing/auth-test-env.js';
import { fakeSecretValue } from '../common/testing/sample-secrets.js';
import { validateEnv } from './env.validation.js';

// Task A11 — khoá ký resetToken `JWT_RESET_SECRET` (S2; cùng quy tắc OTP_HMAC_SECRET của A2). Test case: SE-06 (khoá riêng cho reset). Mã ER-nn là [đề xuất].
// File riêng để không sửa env.validation.spec.ts của A1 đến A10.
const DB = {
  MYSQL_DATABASE: 'clinix',
  MYSQL_USER: 'clinix',
  MYSQL_PASSWORD: 'mat-khau-gia',
};
const VALID = { ...DB, ...TEST_AUTH_ENV };
const MAIL_OK = {
  CLOUDINARY_CLOUD_NAME: 'clinix-test',
  CLOUDINARY_API_KEY: 'test-key',
  CLOUDINARY_API_SECRET: fakeSecretValue('cloudinary'),
  SMTP_HOST: 'smtp.example.test',
  SMTP_USER: 'clinix@example.test',
  SMTP_PASS: fakeSecretValue('smtp'),
};
const RESET_KEY = TEST_AUTH_ENV.JWT_RESET_SECRET;

const messageOf = (config: Record<string, unknown>): string => {
  try {
    validateEnv(config);
  } catch (error) {
    return (error as Error).message;
  }
  return '';
};

describe('validateEnv — khoá ký resetToken JWT_RESET_SECRET (task A11)', () => {
  it('ER-01 khoá cố định của test (TEST_AUTH_ENV) hợp lệ và được giữ nguyên', () => {
    expect(validateEnv({ ...VALID }).JWT_RESET_SECRET).toBe(RESET_KEY);
  });

  it.each([undefined, ''])(
    'ER-02 development được bỏ trống khoá (%j): API vẫn khởi động, ResetTokenService dùng khoá ngẫu nhiên',
    (blank) => {
      const env = validateEnv({
        ...VALID,
        NODE_ENV: 'development',
        JWT_RESET_SECRET: blank,
      });
      expect(env.JWT_RESET_SECRET).toBeUndefined();
    },
  );

  it('ER-03 NODE_ENV mặc định (không đặt) là development nên cũng được bỏ trống khoá', () => {
    const { NODE_ENV: _bo, ...withoutNodeEnv } = { ...VALID, NODE_ENV: 'x' };
    expect(() =>
      validateEnv({ ...withoutNodeEnv, JWT_RESET_SECRET: undefined }),
    ).not.toThrow();
  });

  it.each(['test', 'staging', 'production'])(
    'ER-04 NODE_ENV=%s BẮT BUỘC có khoá: thiếu hoặc để trống thì API không khởi động, thông báo chỉ nêu tên biến',
    (nodeEnv) => {
      for (const blank of [undefined, '']) {
        const message = messageOf({
          ...VALID,
          ...MAIL_OK,
          NODE_ENV: nodeEnv,
          JWT_RESET_SECRET: blank,
        });
        expect(message, String(blank)).toContain(
          `JWT_RESET_SECRET: bắt buộc khi NODE_ENV=${nodeEnv}`,
        );
      }
    },
  );

  it.each(['staging', 'production'])(
    'ER-05 NODE_ENV=%s đủ khoá thì hợp lệ',
    (nodeEnv) => {
      expect(
        validateEnv({ ...VALID, ...MAIL_OK, NODE_ENV: nodeEnv })
          .JWT_RESET_SECRET,
      ).toBe(RESET_KEY);
    },
  );

  it('ER-06 khi đặt thì tối thiểu 32 ký tự (biên 31 / 32)', () => {
    expect(() =>
      validateEnv({ ...VALID, JWT_RESET_SECRET: 'k'.repeat(31) }),
    ).toThrow('JWT_RESET_SECRET');
    expect(
      validateEnv({ ...VALID, JWT_RESET_SECRET: 'k'.repeat(32) })
        .JWT_RESET_SECRET,
    ).toHaveLength(32);
  });

  it.each(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'OTP_HMAC_SECRET'])(
    'ER-07 phải khác %s (mỗi loại bí mật một khoá riêng)',
    (other) => {
      const shared = 'z'.repeat(40);
      const config = {
        ...VALID,
        JWT_ACCESS_SECRET: 'a'.repeat(40),
        JWT_REFRESH_SECRET: 'b'.repeat(40),
        OTP_HMAC_SECRET: 'c'.repeat(40),
        [other]: shared,
        JWT_RESET_SECRET: shared,
      };
      expect(messageOf(config)).toContain(
        'JWT_RESET_SECRET: phải khác JWT_ACCESS_SECRET, JWT_REFRESH_SECRET và OTP_HMAC_SECRET',
      );
    },
  );

  it('ER-08 thông báo lỗi không bao giờ in giá trị khoá', () => {
    const tooShort = fakeSecretValue('reset-ngan').slice(0, 20);
    const message = messageOf({ ...VALID, JWT_RESET_SECRET: tooShort });
    expect(message).toContain('JWT_RESET_SECRET');
    expect(message).not.toContain(tooShort);
    const shared = 'q'.repeat(40);
    const same = messageOf({
      ...VALID,
      JWT_ACCESS_SECRET: shared,
      JWT_REFRESH_SECRET: 'r'.repeat(40),
      JWT_RESET_SECRET: shared,
    });
    expect(same).toContain('JWT_RESET_SECRET');
    expect(same).not.toContain(shared);
  });
});
