import { validateEnv } from './env.validation.js';

// Task P1 — không có mã test case riêng trong plan auth.
describe('validateEnv', () => {
  it('dùng giá trị mặc định khi không khai báo biến', () => {
    const env = validateEnv({});
    expect(env.API_PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('đổi API_PORT dạng chuỗi sang số', () => {
    expect(validateEnv({ API_PORT: '3100', NODE_ENV: 'production' }).API_PORT).toBe(3100);
  });

  it('từ chối cổng ngoài khoảng 1–65535 hoặc không phải số', () => {
    expect(() => validateEnv({ API_PORT: '0' })).toThrow('API_PORT');
    expect(() => validateEnv({ API_PORT: '70000' })).toThrow('API_PORT');
    expect(() => validateEnv({ API_PORT: 'abc' })).toThrow('API_PORT');
  });

  it('từ chối NODE_ENV lạ và không in giá trị của biến trong thông báo lỗi', () => {
    expect(() => validateEnv({ NODE_ENV: 'bi-mat-123' })).toThrow('NODE_ENV');
    expect(() => validateEnv({ NODE_ENV: 'bi-mat-123' })).not.toThrow('bi-mat-123');
  });
});
