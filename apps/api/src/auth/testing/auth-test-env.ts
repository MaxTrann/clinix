// Giá trị cấu hình xác thực GIẢ dành riêng cho test (không phải bí mật thật, chỉ đủ dài và khác nhau để qua validateEnv).
// File này cố ý KHÔNG import gì để vitest.test-env.ts nạp nhẹ. Test tích hợp/e2e luôn dùng đúng các giá trị này,
// không bao giờ đọc JWT_* từ file .env của lập trình viên.
export const TEST_AUTH_ENV = {
  JWT_ACCESS_SECRET: 'test-only-access-secret-not-real-0001-abcdefghij',
  JWT_REFRESH_SECRET: 'test-only-refresh-secret-not-real-0002-klmnopqrst',
  // Khoá HMAC của mã OTP (task A2): test luôn dùng khoá cố định này, không dùng khoá ngẫu nhiên của development
  OTP_HMAC_SECRET: 'test-only-otp-hmac-secret-not-real-0003-uvwxyzabcd',
  WEB_ORIGIN: 'http://localhost:5173',
  COOKIE_SECURE: 'true',
} as const;
