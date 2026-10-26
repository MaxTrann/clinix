import { validateEnv } from './env.validation.js';

// Task P1/P3 — không có mã test case riêng trong plan auth.
const DB = {
  MYSQL_DATABASE: 'clinix',
  MYSQL_USER: 'clinix',
  MYSQL_PASSWORD: 'mat-khau-gia',
};

describe('validateEnv', () => {
  it('dùng giá trị mặc định khi chỉ khai báo bắt buộc (thông tin đăng nhập DB)', () => {
    const env = validateEnv({ ...DB });
    expect(env.API_PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.DB_HOST).toBe('127.0.0.1');
    expect(env.DB_PORT).toBe(3306);
    expect(env.DB_TIMEZONE).toBe('+07:00');
    expect(env.DB_MIGRATIONS_RUN).toBe(false);
  });

  it('bắt buộc có MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD', () => {
    expect(() => validateEnv({})).toThrow('MYSQL_DATABASE');
    expect(() => validateEnv({ ...DB, MYSQL_PASSWORD: '' })).toThrow(
      'MYSQL_PASSWORD',
    );
    expect(() =>
      validateEnv({ MYSQL_DATABASE: 'clinix', MYSQL_USER: 'clinix' }),
    ).toThrow('MYSQL_PASSWORD');
  });

  it('đổi API_PORT và DB_PORT dạng chuỗi sang số', () => {
    const env = validateEnv({
      ...DB,
      API_PORT: '3100',
      DB_PORT: '3307',
      NODE_ENV: 'production',
    });
    expect(env.API_PORT).toBe(3100);
    expect(env.DB_PORT).toBe(3307);
  });

  it('từ chối cổng ngoài khoảng 1–65535 hoặc không phải số', () => {
    expect(() => validateEnv({ ...DB, API_PORT: '0' })).toThrow('API_PORT');
    expect(() => validateEnv({ ...DB, API_PORT: '70000' })).toThrow('API_PORT');
    expect(() => validateEnv({ ...DB, API_PORT: 'abc' })).toThrow('API_PORT');
    expect(() => validateEnv({ ...DB, DB_PORT: '0' })).toThrow('DB_PORT');
  });

  it('DB_MIGRATIONS_RUN: chuỗi "false" phải là false (không bị chuyển kiểu ngầm thành true)', () => {
    expect(
      validateEnv({ ...DB, DB_MIGRATIONS_RUN: 'false' }).DB_MIGRATIONS_RUN,
    ).toBe(false);
    expect(
      validateEnv({ ...DB, DB_MIGRATIONS_RUN: 'true' }).DB_MIGRATIONS_RUN,
    ).toBe(true);
    expect(
      validateEnv({ ...DB, DB_MIGRATIONS_RUN: '' }).DB_MIGRATIONS_RUN,
    ).toBe(false);
  });

  it('DB_TIMEZONE phải dạng +07:00', () => {
    expect(validateEnv({ ...DB, DB_TIMEZONE: '-05:30' }).DB_TIMEZONE).toBe(
      '-05:30',
    );
    expect(() =>
      validateEnv({ ...DB, DB_TIMEZONE: 'Asia/Ho_Chi_Minh' }),
    ).toThrow('DB_TIMEZONE');
    expect(() => validateEnv({ ...DB, DB_TIMEZONE: "+07:00'; DROP" })).toThrow(
      'DB_TIMEZONE',
    );
  });

  it('từ chối NODE_ENV lạ và không in giá trị của biến trong thông báo lỗi', () => {
    expect(() => validateEnv({ ...DB, NODE_ENV: 'bi-mat-123' })).toThrow(
      'NODE_ENV',
    );
    expect(() => validateEnv({ ...DB, NODE_ENV: 'bi-mat-123' })).not.toThrow(
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
