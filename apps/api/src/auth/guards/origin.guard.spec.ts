import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { createTestConfigService } from '../testing/auth-test-config.js';
import { OriginGuard } from './origin.guard.js';

// Task A3. Test case: DN-34 và DX-07 (Origin của /auth/refresh và /auth/logout: đúng thì qua; sai hoặc vắng thì 403).
// Bản kiểm qua HTTP thật ở test/auth-cookie-origin.e2e-spec.ts.
const guard = new OriginGuard(
  createTestConfigService({ WEB_ORIGIN: 'https://clinix.example.com' }),
);

function contextWithOrigin(origin: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: origin === undefined ? {} : { origin } }),
    }),
  } as unknown as ExecutionContext;
}

describe('OriginGuard (DN-34, DX-07)', () => {
  it('Origin đúng bằng WEB_ORIGIN thì qua', () => {
    expect(
      guard.canActivate(contextWithOrigin('https://clinix.example.com')),
    ).toBe(true);
  });

  it.each([
    ['vắng header Origin', undefined],
    ['rỗng', ''],
    ['"null" (trang sandbox, file://)', 'null'],
    ['trang web khác', 'https://evil.example.com'],
    ['cùng tên miền khác giao thức', 'http://clinix.example.com'],
    ['cùng tên miền khác cổng', 'https://clinix.example.com:8443'],
    ['tên miền con', 'https://app.clinix.example.com'],
    ['tên miền bắt đầu giống nhau', 'https://clinix.example.com.evil.io'],
    ['có dấu / ở cuối', 'https://clinix.example.com/'],
    ['có đường dẫn', 'https://clinix.example.com/auth'],
    [
      'viết hoa (trình duyệt luôn gửi chữ thường)',
      'HTTPS://CLINIX.EXAMPLE.COM',
    ],
    ['có khoảng trắng', ' https://clinix.example.com'],
  ])('403 ORIGIN_KHONG_HOP_LE khi %s', (_label, origin) => {
    expect(() => guard.canActivate(contextWithOrigin(origin))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(contextWithOrigin(origin))).toThrow(
      'ORIGIN_KHONG_HOP_LE',
    );
  });
});
