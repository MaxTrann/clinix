import { TEST_AUTH_ENV } from '../auth/testing/auth-test-env.js';
import { validateEnv } from './env.validation.js';

// Task P1/P3 — không có mã test case riêng trong plan auth. Task A3: SE-09 và các ràng buộc cấu hình xác thực (cuối file).
const DB = {
  MYSQL_DATABASE: 'clinix',
  MYSQL_USER: 'clinix',
  MYSQL_PASSWORD: 'mat-khau-gia',
};
// Cấu hình hợp lệ tối thiểu: thông tin DB + cấu hình xác thực (JWT_*, WEB_ORIGIN)
const VALID = { ...DB, ...TEST_AUTH_ENV };

describe('validateEnv', () => {
  it('dùng giá trị mặc định khi chỉ khai báo bắt buộc (thông tin đăng nhập DB)', () => {
    const env = validateEnv({ ...VALID });
    expect(env.API_PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.DB_HOST).toBe('127.0.0.1');
    expect(env.DB_PORT).toBe(3306);
    expect(env.DB_TIMEZONE).toBe('+07:00');
    expect(env.DB_MIGRATIONS_RUN).toBe(false);
  });

  it('bắt buộc có MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD', () => {
    expect(() => validateEnv({})).toThrow('MYSQL_DATABASE');
    expect(() => validateEnv({ ...VALID, MYSQL_PASSWORD: '' })).toThrow(
      'MYSQL_PASSWORD',
    );
    expect(() =>
      validateEnv({ MYSQL_DATABASE: 'clinix', MYSQL_USER: 'clinix' }),
    ).toThrow('MYSQL_PASSWORD');
  });

  it('đổi API_PORT và DB_PORT dạng chuỗi sang số', () => {
    const env = validateEnv({
      ...VALID,
      API_PORT: '3100',
      DB_PORT: '3307',
      NODE_ENV: 'production',
    });
    expect(env.API_PORT).toBe(3100);
    expect(env.DB_PORT).toBe(3307);
  });

  it('từ chối cổng ngoài khoảng 1–65535 hoặc không phải số', () => {
    expect(() => validateEnv({ ...VALID, API_PORT: '0' })).toThrow('API_PORT');
    expect(() => validateEnv({ ...VALID, API_PORT: '70000' })).toThrow(
      'API_PORT',
    );
    expect(() => validateEnv({ ...VALID, API_PORT: 'abc' })).toThrow(
      'API_PORT',
    );
    expect(() => validateEnv({ ...VALID, DB_PORT: '0' })).toThrow('DB_PORT');
  });

  it('DB_MIGRATIONS_RUN: chuỗi "false" phải là false (không bị chuyển kiểu ngầm thành true)', () => {
    expect(
      validateEnv({ ...VALID, DB_MIGRATIONS_RUN: 'false' }).DB_MIGRATIONS_RUN,
    ).toBe(false);
    expect(
      validateEnv({ ...VALID, DB_MIGRATIONS_RUN: 'true' }).DB_MIGRATIONS_RUN,
    ).toBe(true);
    expect(
      validateEnv({ ...VALID, DB_MIGRATIONS_RUN: '' }).DB_MIGRATIONS_RUN,
    ).toBe(false);
  });

  it('DB_TIMEZONE phải dạng +07:00', () => {
    expect(validateEnv({ ...VALID, DB_TIMEZONE: '-05:30' }).DB_TIMEZONE).toBe(
      '-05:30',
    );
    expect(() =>
      validateEnv({ ...VALID, DB_TIMEZONE: 'Asia/Ho_Chi_Minh' }),
    ).toThrow('DB_TIMEZONE');
    expect(() =>
      validateEnv({ ...VALID, DB_TIMEZONE: "+07:00'; DROP" }),
    ).toThrow('DB_TIMEZONE');
  });

  it('từ chối NODE_ENV lạ và không in giá trị của biến trong thông báo lỗi', () => {
    expect(() => validateEnv({ ...VALID, NODE_ENV: 'bi-mat-123' })).toThrow(
      'NODE_ENV',
    );
    expect(() => validateEnv({ ...VALID, NODE_ENV: 'bi-mat-123' })).not.toThrow(
      'bi-mat-123',
    );
  });

  it('không in mật khẩu DB trong thông báo lỗi', () => {
    const matKhau = 'mat-khau-tuyet-mat-xyz';
    expect(() =>
      validateEnv({
        MYSQL_DATABASE: '',
        MYSQL_USER: 'u',
        MYSQL_PASSWORD: matKhau,
      }),
    ).toThrow('MYSQL_DATABASE');
    expect(() =>
      validateEnv({
        MYSQL_DATABASE: '',
        MYSQL_USER: 'u',
        MYSQL_PASSWORD: matKhau,
      }),
    ).not.toThrow(matKhau);
  });
});

describe('validateEnv — cấu hình xác thực (task A3)', () => {
  it('đọc cấu hình xác thực; COOKIE_SECURE mặc định BẬT', () => {
    const env = validateEnv({ ...VALID, COOKIE_SECURE: undefined });
    expect(env.JWT_ACCESS_SECRET).toBe(TEST_AUTH_ENV.JWT_ACCESS_SECRET);
    expect(env.JWT_REFRESH_SECRET).toBe(TEST_AUTH_ENV.JWT_REFRESH_SECRET);
    expect(env.WEB_ORIGIN).toBe(TEST_AUTH_ENV.WEB_ORIGIN);
    expect(env.COOKIE_SECURE).toBe(true);
    expect(validateEnv({ ...VALID, COOKIE_SECURE: '' }).COOKIE_SECURE).toBe(
      true,
    );
  });

  it('thiếu hẳn biến COOKIE_SECURE (trường hợp phổ biến nhất) thì mặc định BẬT, kể cả ở production', () => {
    const { COOKIE_SECURE: _bo, ...withoutCookieSecure } = VALID;
    expect(validateEnv(withoutCookieSecure).COOKIE_SECURE).toBe(true);
    expect(
      validateEnv({ ...withoutCookieSecure, NODE_ENV: 'production' })
        .COOKIE_SECURE,
    ).toBe(true);
  });

  it('bắt buộc có JWT_ACCESS_SECRET, JWT_REFRESH_SECRET và WEB_ORIGIN', () => {
    for (const name of [
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'WEB_ORIGIN',
    ]) {
      const config: Record<string, unknown> = { ...VALID };
      delete config[name];
      expect(() => validateEnv(config), name).toThrow(name);
    }
  });

  it('khoá JWT phải dài ít nhất 32 ký tự (biên 31 / 32)', () => {
    expect(() =>
      validateEnv({ ...VALID, JWT_ACCESS_SECRET: 'a'.repeat(31) }),
    ).toThrow('JWT_ACCESS_SECRET');
    expect(() =>
      validateEnv({ ...VALID, JWT_REFRESH_SECRET: 'b'.repeat(31) }),
    ).toThrow('JWT_REFRESH_SECRET');
    expect(
      validateEnv({ ...VALID, JWT_ACCESS_SECRET: 'a'.repeat(32) })
        .JWT_ACCESS_SECRET,
    ).toHaveLength(32);
  });

  it('khoá access và khoá refresh phải khác nhau (SE-06)', () => {
    const same = 'x'.repeat(40);
    expect(() =>
      validateEnv({
        ...VALID,
        JWT_ACCESS_SECRET: same,
        JWT_REFRESH_SECRET: same,
      }),
    ).toThrow('JWT_REFRESH_SECRET: phải khác JWT_ACCESS_SECRET');
  });

  it.each(['production', 'staging', 'test'])(
    'COOKIE_SECURE=false bị từ chối khi NODE_ENV=%s — API không khởi động (SE-09, N5)',
    (nodeEnv) => {
      expect(() =>
        validateEnv({ ...VALID, NODE_ENV: nodeEnv, COOKIE_SECURE: 'false' }),
      ).toThrow('COOKIE_SECURE');
      expect(() =>
        validateEnv({ ...VALID, NODE_ENV: nodeEnv, COOKIE_SECURE: false }),
      ).toThrow('COOKIE_SECURE');
    },
  );

  it('COOKIE_SECURE=false chỉ được chấp nhận khi NODE_ENV=development (SE-09)', () => {
    const env = validateEnv({
      ...VALID,
      NODE_ENV: 'development',
      COOKIE_SECURE: 'false',
    });
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it('COOKIE_SECURE=true hợp lệ ở mọi môi trường', () => {
    for (const nodeEnv of ['development', 'test', 'staging', 'production']) {
      expect(
        validateEnv({ ...VALID, NODE_ENV: nodeEnv, COOKIE_SECURE: 'true' })
          .COOKIE_SECURE,
      ).toBe(true);
    }
  });

  it('COOKIE_SECURE chỉ nhận true/false: giá trị gõ nhầm bị báo lỗi, không lặng lẽ thành false', () => {
    for (const bad of ['ture', '0', 'no', 'False ', 'TRUE']) {
      expect(
        () =>
          validateEnv({
            ...VALID,
            NODE_ENV: 'development',
            COOKIE_SECURE: bad,
          }),
        bad,
      ).toThrow('COOKIE_SECURE');
    }
  });

  it.each([
    'http://localhost:5173',
    'https://clinix.example.com',
    'http://127.0.0.1:8080',
  ])('WEB_ORIGIN hợp lệ: %s', (origin) => {
    expect(validateEnv({ ...VALID, WEB_ORIGIN: origin }).WEB_ORIGIN).toBe(
      origin,
    );
  });

  it.each([
    'localhost:5173',
    'http://localhost:5173/',
    'http://localhost:5173/app',
    'ftp://localhost',
    'https://clinix.example.com?x=1',
    'HTTP://LOCALHOST:5173',
    'khong-phai-url',
  ])('WEB_ORIGIN không phải origin chuẩn bị từ chối: %s', (origin) => {
    expect(() => validateEnv({ ...VALID, WEB_ORIGIN: origin })).toThrow(
      'WEB_ORIGIN',
    );
  });

  it('thông báo lỗi không bao giờ in giá trị khoá JWT', () => {
    const secret = 'khoa-bi-mat-ngan-rat-bi-mat';
    let message = '';
    try {
      validateEnv({
        ...VALID,
        JWT_ACCESS_SECRET: secret,
        JWT_REFRESH_SECRET: secret,
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('JWT_ACCESS_SECRET');
    expect(message).not.toContain(secret);
  });
});
