import type { Request, Response } from 'express';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from '../auth.constants.js';
import { createTestConfigService } from '../testing/auth-test-config.js';
import { RefreshCookieService } from './refresh-cookie.service.js';

// Task A3. Test case: DN-33 (thuộc tính cookie refresh: HttpOnly, Secure, SameSite=Lax, Path=/api/auth). Bản kiểm qua HTTP thật
// (header Set-Cookie) ở test/auth-cookie-origin.e2e-spec.ts.
const EXPIRES = new Date('2026-10-27T01:30:00.000Z');

function fakeResponse() {
  return { cookie: vi.fn(), clearCookie: vi.fn() };
}

describe('RefreshCookieService — thuộc tính cookie (DN-33)', () => {
  it('đặt cookie: tên refresh_token, HttpOnly, Secure, SameSite=Lax, Path=/api/auth, hết hạn đúng mốc', () => {
    const res = fakeResponse();
    new RefreshCookieService(
      createTestConfigService({ COOKIE_SECURE: true }),
    ).set(res as unknown as Response, 'tok', EXPIRES);
    expect(res.cookie).toHaveBeenCalledExactlyOnceWith('refresh_token', 'tok', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/auth',
      expires: EXPIRES,
    });
    expect(REFRESH_COOKIE_NAME).toBe('refresh_token');
    expect(REFRESH_COOKIE_PATH).toBe('/api/auth');
  });

  it('COOKIE_SECURE=false (chỉ ở development) thì bỏ Secure, các thuộc tính khác giữ nguyên', () => {
    const res = fakeResponse();
    new RefreshCookieService(
      createTestConfigService({ COOKIE_SECURE: false }),
    ).set(res as unknown as Response, 'tok', EXPIRES);
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'tok', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/api/auth',
      expires: EXPIRES,
    });
  });

  it('xoá cookie dùng đúng Path/Secure/SameSite lúc đặt (nếu khác, trình duyệt sẽ không xoá cookie cũ)', () => {
    const res = fakeResponse();
    new RefreshCookieService(createTestConfigService()).clear(
      res as unknown as Response,
    );
    expect(res.clearCookie).toHaveBeenCalledExactlyOnceWith('refresh_token', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/auth',
    });
  });
});

describe('RefreshCookieService.read', () => {
  const service = new RefreshCookieService(createTestConfigService());
  const requestWith = (cookies: unknown) => ({ cookies }) as unknown as Request;

  it('đọc đúng cookie refresh_token', () => {
    expect(service.read(requestWith({ refresh_token: 'abc.def.ghi' }))).toBe(
      'abc.def.ghi',
    );
  });

  it('không có cookie, cookie rỗng, quá dài, không phải chuỗi, hoặc chưa qua cookie-parser → undefined', () => {
    expect(service.read(requestWith({}))).toBeUndefined();
    expect(service.read(requestWith(undefined))).toBeUndefined();
    expect(service.read(requestWith({ refresh_token: '' }))).toBeUndefined();
    expect(
      service.read(requestWith({ refresh_token: 'x'.repeat(301) })),
    ).toBeUndefined();
    expect(
      service.read(requestWith({ refresh_token: ['a', 'b'] })),
    ).toBeUndefined();
    expect(
      service.read(requestWith({ refresh_token: { a: 1 } })),
    ).toBeUndefined();
    expect(service.read(requestWith({ cookie_khac: 'x' }))).toBeUndefined();
  });
});
