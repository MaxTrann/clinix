// Cấu hình email dành riêng cho test: ÉP mọi biến SMTP/MAIL về rỗng để test tích hợp/e2e không bao giờ dùng Gmail thật của lập trình viên
// (kể cả khi shell hoặc .env của họ có SMTP_*). Test cần MailService thì dùng FakeMailService hoặc transport giả.
// File này cố ý KHÔNG import gì để vitest.test-env.ts nạp nhẹ (giống auth-test-env.ts).
export const TEST_MAIL_ENV = {
  SMTP_HOST: '',
  SMTP_PORT: '',
  SMTP_USER: '',
  SMTP_PASS: '',
  MAIL_FROM_NAME: '',
  MAIL_FROM_ADDRESS: '',
  MAIL_SUPPORT_ADDRESS: '',
} as const;
