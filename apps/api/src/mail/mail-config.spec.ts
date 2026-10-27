import { fakeSecretValue } from '../common/testing/sample-secrets.js';
import {
  SMTP_TIMEOUTS,
  buildSmtpTransportOptions,
  readMailConfig,
  type MailConfig,
  type MailEnv,
} from './mail-config.js';

// Task P4. Truy vết ĐK b6, QMK b5. Mã nội bộ MAIL-05… là [đề xuất]. TLS không được hạ cấp, có timeout, không bật log của nodemailer.
const PASS = fakeSecretValue('smtp');

const BASE_ENV: MailEnv = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: 465,
  SMTP_USER: 'clinix@example.test',
  SMTP_PASS: PASS,
  MAIL_FROM_NAME: 'CLINIX',
  MAIL_FROM_ADDRESS: undefined,
  MAIL_SUPPORT_ADDRESS: undefined,
};

function config(overrides: Partial<MailConfig> = {}): MailConfig {
  const base = readMailConfig(BASE_ENV);
  if (!base) throw new Error('BASE_ENV phải cấu hình đủ');
  return { ...base, ...overrides };
}

// Duyệt sâu mọi khoá của đối tượng tuỳ chọn
function allKeys(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [
    key,
    ...allKeys(child),
  ]);
}

describe('readMailConfig (MAIL-05)', () => {
  it('đủ SMTP_HOST, SMTP_USER, SMTP_PASS thì có cấu hình; địa chỉ gửi mặc định là SMTP_USER', () => {
    expect(readMailConfig(BASE_ENV)).toEqual({
      host: 'smtp.example.test',
      port: 465,
      user: 'clinix@example.test',
      pass: PASS,
      fromName: 'CLINIX',
      fromAddress: 'clinix@example.test',
    });
  });

  it('MAIL_FROM_ADDRESS và MAIL_SUPPORT_ADDRESS được dùng khi đặt', () => {
    const result = readMailConfig({
      ...BASE_ENV,
      MAIL_FROM_ADDRESS: 'gui@example.test',
      MAIL_SUPPORT_ADDRESS: 'hotro@example.test',
    });
    expect(result?.fromAddress).toBe('gui@example.test');
    expect(result?.supportAddress).toBe('hotro@example.test');
  });

  it.each(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const)(
    'thiếu %s thì không có cấu hình (MailService báo NOT_CONFIGURED)',
    (name) => {
      expect(readMailConfig({ ...BASE_ENV, [name]: undefined })).toBeNull();
      expect(readMailConfig({ ...BASE_ENV, [name]: '' })).toBeNull();
    },
  );

  it('không đặt gì cả thì null', () => {
    expect(
      readMailConfig({
        ...BASE_ENV,
        SMTP_HOST: undefined,
        SMTP_USER: undefined,
        SMTP_PASS: undefined,
      }),
    ).toBeNull();
  });
});

describe('buildSmtpTransportOptions — không hạ cấp TLS (MAIL-06)', () => {
  it('cổng 465: TLS ngay từ đầu', () => {
    const options = buildSmtpTransportOptions(config({ port: 465 }));
    expect(options.secure).toBe(true);
    expect(options.requireTLS).toBe(false);
  });

  it.each([587, 25, 2525])(
    'cổng %s: STARTTLS BẮT BUỘC (requireTLS), không nhận gửi dạng rõ',
    (port) => {
      const options = buildSmtpTransportOptions(config({ port }));
      expect(options.secure).toBe(false);
      expect(options.requireTLS).toBe(true);
    },
  );

  it('không bao giờ đặt rejectUnauthorized, ignoreTLS, opportunisticTLS, logger, debug ở bất kỳ cổng nào', () => {
    for (const port of [465, 587, 2525]) {
      const keys = allKeys(buildSmtpTransportOptions(config({ port })));
      for (const forbidden of [
        'rejectUnauthorized',
        'ignoreTLS',
        'opportunisticTLS',
        'logger',
        'debug',
        'checkServerIdentity',
      ]) {
        expect(keys, `${forbidden} ở cổng ${String(port)}`).not.toContain(
          forbidden,
        );
      }
    }
  });

  it('đặt rõ phiên bản TLS tối thiểu 1.2', () => {
    expect(buildSmtpTransportOptions(config()).tls).toEqual({
      minVersion: 'TLSv1.2',
    });
  });

  it('truyền đúng máy chủ, cổng, tài khoản', () => {
    const options = buildSmtpTransportOptions(
      config({ host: 'smtp.example.test', port: 587 }),
    );
    expect(options.host).toBe('smtp.example.test');
    expect(options.port).toBe(587);
    expect(options.auth).toEqual({ user: 'clinix@example.test', pass: PASS });
  });
});

describe('buildSmtpTransportOptions — thời gian chờ (MAIL-07)', () => {
  it('có đủ bốn hạn chờ, đều hữu hạn, dương và ngắn hơn mặc định của nodemailer (2 phút / 30 giây / 10 phút / 30 giây)', () => {
    const options = buildSmtpTransportOptions(config());
    const timeouts = {
      connectionTimeout: options.connectionTimeout,
      greetingTimeout: options.greetingTimeout,
      socketTimeout: options.socketTimeout,
      dnsTimeout: options.dnsTimeout,
    };
    expect(timeouts).toEqual(SMTP_TIMEOUTS);
    for (const value of Object.values(timeouts)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
    expect(SMTP_TIMEOUTS.connectionTimeout).toBeLessThanOrEqual(30_000);
    expect(SMTP_TIMEOUTS.greetingTimeout).toBeLessThanOrEqual(30_000);
    expect(SMTP_TIMEOUTS.socketTimeout).toBeLessThanOrEqual(30_000);
    expect(SMTP_TIMEOUTS.dnsTimeout).toBeLessThanOrEqual(30_000);
  });

  it('cho phép ghi đè hạn chờ (dùng trong test với máy chủ giả)', () => {
    const options = buildSmtpTransportOptions(config(), {
      connectionTimeout: 1,
      greetingTimeout: 2,
      socketTimeout: 3,
      dnsTimeout: 4,
    });
    expect([
      options.connectionTimeout,
      options.greetingTimeout,
      options.socketTimeout,
      options.dnsTimeout,
    ]).toEqual([1, 2, 3, 4]);
  });
});
