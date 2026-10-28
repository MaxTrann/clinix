import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { collectSecretValues } from '../../common/logging/sanitize.js';
import { createAppLogger } from '../../common/logging/sanitizing.logger.js';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import type { MaXacThucRepository } from '../repositories/ma-xac-thuc.repository.js';
import { TEST_AUTH_ENV } from '../testing/auth-test-env.js';
import { createTestConfigService } from '../testing/auth-test-config.js';
import { OtpService } from './otp.service.js';

// Task A2, khoá HMAC của OTP (S3; điều kiện (a) của lượt duyệt kế hoạch). Mã nội bộ OTP-13 là [đề xuất].
//  - đặt OTP_HMAC_SECRET thì dùng nó;
//  - khoá ngẫu nhiên theo từng lần khởi động CHỈ dùng ở NODE_ENV=development (kèm cảnh báo không in khoá);
//  - test, staging, production thiếu khoá thì KHÔNG khởi động được (không bao giờ tự sinh khoá);
//  - tên biến khớp collectSecretValues của P5 nên bị che khỏi log.
const SECRET = TEST_AUTH_ENV.OTP_HMAC_SECRET;

function create(overrides: Record<string, unknown>): OtpService {
  return new OtpService(
    {} as DataSource,
    {} as MaXacThucRepository,
    new FakeMailService(),
    createTestConfigService(overrides),
  );
}
const keyOf = (service: OtpService) => Reflect.get(service, 'key') as Buffer;

let warnings: string[];
beforeEach(() => {
  warnings = [];
  vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
    warnings.push(String(message));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('OtpService — khoá HMAC (OTP-13)', () => {
  it('đặt OTP_HMAC_SECRET: dùng đúng giá trị đó, không cảnh báo', () => {
    const service = create({ OTP_HMAC_SECRET: SECRET, NODE_ENV: 'staging' });
    expect(keyOf(service).equals(Buffer.from(SECRET, 'utf8'))).toBe(true);
    expect(warnings).toEqual([]);
  });

  it('development không đặt khoá: dùng khoá ngẫu nhiên 32 byte, mỗi lần khởi động một khoá khác', () => {
    const a = create({ OTP_HMAC_SECRET: undefined, NODE_ENV: 'development' });
    const b = create({ OTP_HMAC_SECRET: undefined, NODE_ENV: 'development' });
    expect(keyOf(a)).toHaveLength(32);
    expect(keyOf(a).equals(keyOf(b))).toBe(false);
    expect(keyOf(a).equals(Buffer.from(SECRET, 'utf8'))).toBe(false);
  });

  it('development không đặt khoá: cảnh báo nêu tên biến và hậu quả, KHÔNG in khoá (dạng hex hay base64)', () => {
    const service = create({
      OTP_HMAC_SECRET: undefined,
      NODE_ENV: 'development',
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('OTP_HMAC_SECRET');
    expect(warnings[0]).toContain('khởi động lại');
    const key = keyOf(service);
    expect(warnings[0]).not.toContain(key.toString('hex'));
    expect(warnings[0]).not.toContain(key.toString('base64'));
    expect(warnings[0]).not.toContain(key.toString('utf8'));
  });

  it.each(['test', 'staging', 'production'])(
    'NODE_ENV=%s không đặt khoá: không khởi động được (không bao giờ tự sinh khoá), thông báo chỉ nêu tên biến',
    (nodeEnv) => {
      let message = '';
      try {
        create({ OTP_HMAC_SECRET: undefined, NODE_ENV: nodeEnv });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toBe(
        'OTP_HMAC_SECRET: bắt buộc khi NODE_ENV khác development',
      );
      expect(warnings).toEqual([]);
    },
  );

  it('khoá rỗng cũng coi như chưa đặt', () => {
    expect(() =>
      create({ OTP_HMAC_SECRET: '', NODE_ENV: 'production' }),
    ).toThrow('OTP_HMAC_SECRET');
  });
});

describe('OTP_HMAC_SECRET bị che khỏi log (OTP-14; collectSecretValues của P5)', () => {
  it('tên biến khớp quy tắc nên collectSecretValues lấy giá trị làm bí mật cần che', () => {
    expect(collectSecretValues({ OTP_HMAC_SECRET: SECRET })).toEqual([SECRET]);
  });

  it('logger của ứng dụng che giá trị khoá trong chuỗi, đối tượng và Error', () => {
    const chunks: string[] = [];
    const capture = (chunk: unknown): boolean => {
      chunks.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stdout, 'write').mockImplementation(capture);
    vi.spyOn(process.stderr, 'write').mockImplementation(capture);
    const logger = createAppLogger({ OTP_HMAC_SECRET: SECRET });

    logger.log(`khoá là ${SECRET}`);
    logger.warn({ ghiChu: SECRET });
    logger.error(new Error(`lỗi mang khoá ${SECRET}`));

    const output = chunks.join('');
    expect(output).not.toContain(SECRET);
    expect(output).toContain('[REDACTED]');
  });
});
