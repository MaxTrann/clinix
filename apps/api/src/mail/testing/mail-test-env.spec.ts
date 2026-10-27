import { vi } from 'vitest';
import { applyTestEnv } from '../../../vitest.test-env.js';
import { TEST_MAIL_ENV } from './mail-test-env.js';

// Task P4. Test tích hợp/e2e KHÔNG BAO GIỜ dùng Gmail thật của lập trình viên, dù máy có sẵn SMTP_* (vitest.test-env.ts ép về rỗng).
// Mã nội bộ MAIL-29 là [đề xuất]. applyTestEnv ghi vào process.env của tiến trình test, nên khôi phục sau mỗi ca.
const snapshot = { ...process.env };
afterEach(() => {
  vi.unstubAllEnvs();
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) delete process.env[key];
  }
  Object.assign(process.env, snapshot);
});

describe('applyTestEnv và biến email (MAIL-29)', () => {
  it('TEST_MAIL_ENV ép đủ bảy biến email về chuỗi rỗng', () => {
    expect(Object.keys(TEST_MAIL_ENV).sort()).toEqual(
      [
        'MAIL_FROM_ADDRESS',
        'MAIL_FROM_NAME',
        'MAIL_SUPPORT_ADDRESS',
        'SMTP_HOST',
        'SMTP_PASS',
        'SMTP_PORT',
        'SMTP_USER',
      ].sort(),
    );
    expect(Object.values(TEST_MAIL_ENV).every((value) => value === '')).toBe(
      true,
    );
  });

  it('máy có sẵn SMTP_* thật thì applyTestEnv vẫn ghi đè thành rỗng', () => {
    for (const name of Object.keys(TEST_MAIL_ENV)) {
      vi.stubEnv(name, 'gia-tri-cua-may-lap-trinh-vien');
    }

    applyTestEnv();

    for (const name of Object.keys(TEST_MAIL_ENV)) {
      expect(process.env[name], name).toBe('');
    }
  });
});
