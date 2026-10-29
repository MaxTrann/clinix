// Hạ tầng test HTTP cho làm mới phiên (task A9, MySQL thật): dựng AppModule thật qua configureApp (bộ lọc lỗi P5, cookie-parser, ValidationPipe, bộ che log)
// cùng MỘT route cần đăng nhập để thử access token. Chỉ dùng trong test (thư mục testing/ không vào bản build).
import { Controller, Get, Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { MailService } from '../../mail/mail.service.js';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { AuthModule } from '../auth.module.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator.js';
import { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import type { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { insertTaiKhoan } from '../entities/testing/auth-fixtures.js';
import { PhienDangNhapRepository } from '../repositories/phien-dang-nhap.repository.js';
import {
  SessionService,
  type IssuedSession,
} from '../session/session.service.js';
import { TokenService } from '../session/token.service.js';
import { TEST_AUTH_ENV } from './auth-test-env.js';

export const WEB_ORIGIN = TEST_AUTH_ENV.WEB_ORIGIN;

@Controller('refresh-probe')
class RefreshProbeController {
  /** Route cần đăng nhập (không @Public): trả người dùng mà JwtAuthGuard gắn, để thử access token trước và sau khi làm mới. */
  @Get('whoami')
  whoami(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}

@Module({ imports: [AuthModule], controllers: [RefreshProbeController] })
class RefreshProbeModule {}

type PostRequest = ReturnType<ReturnType<typeof request>['post']>;
type GetRequest = ReturnType<ReturnType<typeof request>['get']>;

/** Một lần gọi POST /auth/refresh. */
export interface RefreshCall {
  /** Giá trị của cookie `refresh_token`. */
  cookie?: string;
  /** Header Cookie viết thẳng (thử nhiều giá trị, cookie rỗng, tên khác…); thắng `cookie`. */
  rawCookie?: string;
  /** Header Origin; mặc định WEB_ORIGIN, `null` = KHÔNG gửi header này. */
  origin?: string | null;
  authorization?: string;
  /** Thân JSON và query (để chứng minh token ở đó bị bỏ qua). */
  body?: object;
  query?: Record<string, string>;
}

export interface RefreshHarness {
  app: NestExpressApplication;
  db: DataSource;
  mail: FakeMailService;
  sessions: SessionService;
  tokens: TokenService;
  repo: PhienDangNhapRepository;
  refresh: (call?: RefreshCall) => PostRequest;
  whoami: (accessToken: string) => GetRequest;
  /** Tài khoản mới (email khác nhau) và một phiên đang sống của nó, tạo ở đồng hồ giả hiện tại. */
  newSession: (
    overrides?: Partial<TaiKhoan>,
  ) => Promise<{ accountId: string; session: IssuedSession }>;
  rowOf: (sessionId: string) => Promise<PhienDangNhap>;
  close: () => Promise<void>;
}

/** Dựng ứng dụng thật (MailService giả) và LẮNG NGHE cổng ngẫu nhiên để nhiều request song song dùng chung một máy chủ. */
export async function openRefreshHarness(): Promise<RefreshHarness> {
  const mail = new FakeMailService();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, RefreshProbeModule],
  })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app); // đúng cấu hình như main.ts
  await app.listen(0);
  const db = app.get(DataSource);
  const sessions = app.get(SessionService);

  return {
    app,
    db,
    mail,
    sessions,
    tokens: app.get(TokenService),
    repo: app.get(PhienDangNhapRepository),
    refresh: (call = {}) => {
      let req = request(app.getHttpServer()).post('/auth/refresh');
      const origin = call.origin === undefined ? WEB_ORIGIN : call.origin;
      if (origin !== null) req = req.set('Origin', origin);
      const cookie =
        call.rawCookie ??
        (call.cookie === undefined
          ? undefined
          : `refresh_token=${call.cookie}`);
      if (cookie !== undefined) req = req.set('Cookie', cookie);
      if (call.authorization !== undefined) {
        req = req.set('Authorization', call.authorization);
      }
      if (call.query !== undefined) req = req.query(call.query);
      if (call.body !== undefined) req = req.send(call.body);
      return req;
    },
    whoami: (accessToken) =>
      request(app.getHttpServer())
        .get('/refresh-probe/whoami')
        .set('Authorization', `Bearer ${accessToken}`),
    newSession: async (overrides = {}) => {
      const account = await insertTaiKhoan(db, {
        daXacMinhEmail: true,
        ...overrides,
      });
      return {
        accountId: account.taiKhoanId,
        session: await sessions.create(account.taiKhoanId),
      };
    },
    rowOf: (sessionId) =>
      db
        .getRepository(PhienDangNhap)
        .findOneByOrFail({ phienDangNhapId: sessionId }),
    close: () => app.close(),
  };
}

// ---------- Đọc phản hồi ----------

export interface ResponseLike {
  headers: Record<string, unknown>;
}

export const setCookiesOf = (res: ResponseLike): string[] => {
  const header = res.headers['set-cookie'];
  return Array.isArray(header) ? (header as string[]) : [];
};

/** Refresh token trong MỘT Set-Cookie của phản hồi (đã giải mã %xx). */
export function refreshTokenOf(res: ResponseLike): string {
  const cookies = setCookiesOf(res);
  expect(cookies).toHaveLength(1);
  const match = /^refresh_token=([^;]+);/.exec(cookies[0] ?? '');
  expect(match, 'Set-Cookie phải mang refresh_token').not.toBeNull();
  return decodeURIComponent(match?.[1] ?? '');
}

/** Các thuộc tính của một Set-Cookie trừ giá trị và Expires, đã sắp xếp (để so cờ của hai cookie). */
export const flagsOf = (setCookie: string): string[] =>
  setCookie
    .split('; ')
    .slice(1)
    .filter((part) => !part.startsWith('Expires='))
    .sort();

export const expectNoSetCookie = (res: ResponseLike): void => {
  expect(setCookiesOf(res)).toEqual([]);
};

/** Cookie bị xoá đúng cách: giá trị rỗng, hết hạn năm 1970, cùng Path/Secure/SameSite/HttpOnly như lúc đặt (nếu không trình duyệt không xoá đúng cookie). */
export function expectCookieCleared(res: ResponseLike): void {
  const cookies = setCookiesOf(res);
  expect(cookies).toHaveLength(1);
  const cookie = cookies[0] ?? '';
  expect(cookie).toMatch(/^refresh_token=;/);
  for (const part of [
    'Path=/api/auth',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ]) {
    expect(cookie).toContain(part);
  }
}

/** Claim `exp` (giây) của một JWT, đọc thẳng từ phần thân (không kiểm chữ ký). */
export function expOf(jwt: string): number {
  const payload = JSON.parse(
    Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8'),
  ) as { exp: number };
  return payload.exp;
}
