import { TEST_AUTH_ENV } from '../auth/testing/auth-test-env.js';
import { validateEnv } from './env.validation.js';

// Task B14 (admin) — ba biến của liên kết kích hoạt nhân sự (PLAN admin 5.1; Q22, Q23): STAFF_ACTIVATION_TTL_HOURS,
// STAFF_ACTIVATION_RESEND_MIN_SECONDS, STAFF_ACTIVATION_RESEND_MAX_PER_HOUR. Mã NSB14-11 là [đề xuất].
// File riêng để không sửa env.validation.spec.ts của các task trước (cùng cách với env.validation.reset.spec.ts).
const DB = {
  MYSQL_DATABASE: 'clinix',
  MYSQL_USER: 'clinix',
  MYSQL_PASSWORD: 'mat-khau-gia',
};
const VALID = { ...DB, ...TEST_AUTH_ENV };

const VARIABLES = [
  { name: 'STAFF_ACTIVATION_TTL_HOURS', fallback: 24, min: 1, max: 168 },
  {
    name: 'STAFF_ACTIVATION_RESEND_MIN_SECONDS',
    fallback: 60,
    min: 1,
    max: 3600,
  },
  {
    name: 'STAFF_ACTIVATION_RESEND_MAX_PER_HOUR',
    fallback: 5,
    min: 1,
    max: 60,
  },
] as const;

const messageOf = (config: Record<string, unknown>): string => {
  try {
    validateEnv(config);
  } catch (error) {
    return (error as Error).message;
  }
  return '';
};

describe('validateEnv — biến STAFF_ACTIVATION_* (task B14)', () => {
  it('NSB14-11 không đặt biến nào ⇒ mặc định đúng Q22 và Q23: 24 giờ, 60 giây, 5 lần mỗi giờ', () => {
    const env = validateEnv({ ...VALID });
    expect(env.STAFF_ACTIVATION_TTL_HOURS).toBe(24);
    expect(env.STAFF_ACTIVATION_RESEND_MIN_SECONDS).toBe(60);
    expect(env.STAFF_ACTIVATION_RESEND_MAX_PER_HOUR).toBe(5);
  });

  it('NSB14-11 đặt cả ba (chuỗi, như biến môi trường thật) ⇒ thành số', () => {
    const env = validateEnv({
      ...VALID,
      STAFF_ACTIVATION_TTL_HOURS: '48',
      STAFF_ACTIVATION_RESEND_MIN_SECONDS: '1',
      STAFF_ACTIVATION_RESEND_MAX_PER_HOUR: '60',
    });
    expect(env.STAFF_ACTIVATION_TTL_HOURS).toBe(48);
    expect(env.STAFF_ACTIVATION_RESEND_MIN_SECONDS).toBe(1);
    expect(env.STAFF_ACTIVATION_RESEND_MAX_PER_HOUR).toBe(60);
  });

  describe.each(VARIABLES)('$name', ({ name, fallback, min, max }) => {
    it.each([min, fallback, max])(
      'NSB14-11 giá trị %i hợp lệ (biên và mặc định)',
      (value) => {
        const env = validateEnv({ ...VALID, [name]: String(value) });
        expect(env[name]).toBe(value);
      },
    );

    it.each([
      ['dưới biên (min − 1)', String(min - 1)],
      ['trên biên (max + 1)', String(max + 1)],
      ['âm', '-1'],
      ['số thập phân', '1.5'],
      ['chữ', 'abc'],
      ['số kèm chữ', '24h'],
      ['rỗng', ''],
      ['chỉ có khoảng trắng', '   '],
    ])(
      'NSB14-11 %s ⇒ API KHÔNG khởi động, thông báo chỉ nêu TÊN biến, không in giá trị',
      (_label, value) => {
        const message = messageOf({ ...VALID, [name]: value });
        expect(message).toContain(name);
        expect(message).toContain('Cấu hình môi trường không hợp lệ');
        // Không in giá trị sai (trừ giá trị rỗng/khoảng trắng không có gì để in)
        if (value.trim() !== '' && !/^-?\d+$/.test(value)) {
          expect(message).not.toContain(value);
        }
      },
    );
  });

  it('NSB14-11 một biến sai không che lỗi của biến khác: cả hai tên cùng được báo', () => {
    const message = messageOf({
      ...VALID,
      STAFF_ACTIVATION_TTL_HOURS: '0',
      STAFF_ACTIVATION_RESEND_MAX_PER_HOUR: 'abc',
    });
    expect(message).toContain('STAFF_ACTIVATION_TTL_HOURS');
    expect(message).toContain('STAFF_ACTIVATION_RESEND_MAX_PER_HOUR');
    expect(message).not.toContain('STAFF_ACTIVATION_RESEND_MIN_SECONDS');
  });
});
