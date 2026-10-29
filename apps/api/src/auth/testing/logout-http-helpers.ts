// Hạ tầng test HTTP cho đăng xuất (task A10, MySQL thật). Dựng trên openRefreshHarness của A9 (AppModule thật qua configureApp, MailService giả,
// route cần đăng nhập `GET /refresh-probe/whoami`) và chỉ thêm lời gọi POST /auth/logout cùng phép kiểm "đăng xuất thành công".
// Chỉ dùng trong test (thư mục testing/ không vào bản build).
import request from 'supertest';
import {
  WEB_ORIGIN,
  expectCookieCleared,
  openRefreshHarness,
  type RefreshHarness,
  type ResponseLike,
} from './refresh-http-helpers.js';

type PostRequest = ReturnType<ReturnType<typeof request>['post']>;

/** Một lần gọi POST /auth/logout. */
export interface LogoutCall {
  /** Giá trị của cookie `refresh_token`. */
  cookie?: string;
  /** Header Cookie viết thẳng (cookie rỗng, hai cookie cùng tên…); thắng `cookie`. */
  rawCookie?: string;
  /** Header Origin; mặc định WEB_ORIGIN, `null` = KHÔNG gửi header này. */
  origin?: string | null;
  authorization?: string;
  /** Thân JSON và query (để chứng minh token đặt ở đó bị bỏ qua). */
  body?: object;
  query?: Record<string, string>;
}

export interface LogoutHarness extends RefreshHarness {
  logout: (call?: LogoutCall) => PostRequest;
}

export async function openLogoutHarness(): Promise<LogoutHarness> {
  const base = await openRefreshHarness();
  return {
    ...base,
    logout: (call = {}) => {
      const origin = call.origin === undefined ? WEB_ORIGIN : call.origin;
      const cookie =
        call.rawCookie ??
        (call.cookie === undefined ? null : `refresh_token=${call.cookie}`);
      const headers = Object.fromEntries(
        [
          ['Origin', origin],
          ['Cookie', cookie],
          ['Authorization', call.authorization ?? null],
        ].filter(([, value]) => value !== null),
      ) as Record<string, string>;
      const req = request(base.app.getHttpServer())
        .post('/auth/logout')
        .set(headers)
        .query(call.query ?? {});
      return call.body === undefined ? req : req.send(call.body);
    },
  };
}

/**
 * Đăng xuất thành công theo hợp đồng A10: 204, thân rỗng và KHÔNG có Content-Type, `Cache-Control: no-store`, và đúng một Set-Cookie xoá cookie
 * (giá trị rỗng, hết hạn năm 1970, cùng Path/Secure/SameSite/HttpOnly như lúc đặt).
 */
export function expectLoggedOut(
  res: ResponseLike & { status: number; text: string },
): void {
  expect(res.status).toBe(204);
  expect(res.text).toBe('');
  expect(res.headers['content-type']).toBeUndefined();
  expect(res.headers['cache-control']).toBe('no-store');
  expectCookieCleared(res);
}
