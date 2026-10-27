import { Controller, Get, Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { SignJWT, UnsecuredJWT } from 'jose';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  ACCESS_TOKEN_TTL_MS,
  AUTH_ERROR_CODES,
  SESSION_MAX_MS,
} from './../src/auth/auth.constants.js';
import { AuthModule } from './../src/auth/auth.module.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from './../src/auth/decorators/current-user.decorator.js';
import { Public } from './../src/auth/decorators/public.decorator.js';
import { Roles } from './../src/auth/decorators/roles.decorator.js';
import {
  LOAI_TAI_KHOAN,
  type LoaiTaiKhoan,
} from './../src/auth/entities/enums.js';
import { TaiKhoan } from './../src/auth/entities/tai-khoan.entity.js';
import {
  insertPhienDangNhap,
  insertTaiKhoan,
} from './../src/auth/entities/testing/auth-fixtures.js';
import { SessionService } from './../src/auth/session/session.service.js';
import { TokenService } from './../src/auth/session/token.service.js';
import { TEST_AUTH_ENV } from './../src/auth/testing/auth-test-env.js';
import { resetTables } from './../src/database/testing/test-database.js';

// Task A4. Test case: DN-25, DN-26, DN-35, DX-02, DM-05, SE-05, SE-06, qua HTTP thật với AppModule + MySQL thật + đồng hồ giả.
// Chưa có endpoint auth nào nên dùng controller thử chỉ tồn tại trong file test này. Guard đăng ký toàn cục trong AuthModule
// (APP_GUARD), nên controller thử không cần gắn guard nào: đúng như controller admin của Trung sau này.
@Controller('guard-probe')
class ProbeController {
  // Chỉ cần đăng nhập, không @Roles (giống đổi mật khẩu, GET /auth/me)
  @Get('login-only')
  loginOnly(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  @Roles('QuanTriVien')
  @Get('admin')
  admin() {
    return { ok: true };
  }

  @Roles('BacSi', 'LeTan')
  @Get('staff')
  staff() {
    return { ok: true };
  }

  @Public()
  @Get('open')
  open() {
    return { ok: true };
  }

  // Dùng sai: @Public làm mất người dùng nên @Roles không thể đánh giá ⇒ phải đóng (401), không được mở
  @Public()
  @Roles('QuanTriVien')
  @Get('open-with-roles')
  openWithRoles() {
    return { ok: true };
  }

  @Public()
  @Get('open-with-current-user')
  openWithCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }
}

@Module({ imports: [AuthModule], controllers: [ProbeController] })
class ProbeModule {}

const T0 = new Date('2026-10-27T01:00:00.000Z'); // 08:00:00 giờ Việt Nam, đúng giây
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const advanceTo = (seconds: number) => vi.setSystemTime(at(seconds));
const ACCESS_TTL = ACCESS_TOKEN_TTL_MS / 1000; // 900 giây
const MAX = SESSION_MAX_MS / 1000; // 28800 giây

const accessKey = new TextEncoder().encode(TEST_AUTH_ENV.JWT_ACCESS_SECRET);
const refreshKey = new TextEncoder().encode(TEST_AUTH_ENV.JWT_REFRESH_SECRET);

let app: NestExpressApplication;
let db: DataSource;
let tokens: TokenService;
let sessions: SessionService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ProbeModule],
  }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app); // đúng cấu hình như main.ts
  await app.init();
  db = app.get(DataSource);
  tokens = app.get(TokenService);
  sessions = app.get(SessionService);
});

beforeEach(async () => {
  await resetTables(db);
  vi.useFakeTimers({ toFake: ['Date'] }); // chỉ giả Date; bộ hẹn giờ thật vẫn chạy nên HTTP và MySQL không bị ảnh hưởng
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app.close();
});

// ---------- hàm trợ giúp ----------

function call(path: string, token?: string) {
  const req = request(app.getHttpServer()).get(path);
  return token === undefined
    ? req
    : req.set('Authorization', `Bearer ${token}`);
}

// Mã lỗi ổn định nằm trong `message` (dạng JSON chuẩn do bộ lọc lỗi P5 quyết định sau; khi đó chỉ sửa hàm này)
function expectError(
  res: { status: number; body: { message?: unknown } },
  status: number,
  code: string,
) {
  expect(res.status).toBe(status);
  expect(res.body.message).toBe(code);
}

async function login(
  role: LoaiTaiKhoan = 'BenhNhan',
  overrides: Partial<TaiKhoan> = {},
) {
  const account = await insertTaiKhoan(db, {
    loaiTaiKhoan: role,
    ...overrides,
  });
  const issued = await sessions.create(account.taiKhoanId);
  return { accountId: account.taiKhoanId, ...issued };
}

// Access token ký đúng khoá thật như SessionService, nhưng với `notAfter` tuỳ ý (mô phỏng token cấp lúc 7:59 hoặc token "quá dài")
async function signFor(accountId: string, sessionId: string, notAfter: Date) {
  return (await tokens.signAccessToken({ accountId, sessionId, notAfter }))
    .token;
}

// Token giả: chỉnh từng phần để kiểm guard từ chối đúng lý do
async function forge(
  options: {
    sub?: string;
    sid?: string;
    alg?: 'HS256' | 'HS512';
    key?: Uint8Array;
    issuer?: string;
    audience?: string;
  } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: options.sid ?? '1' })
    .setProtectedHeader({ alg: options.alg ?? 'HS256', typ: 'JWT' })
    .setSubject(options.sub ?? '1')
    .setIssuer(options.issuer ?? ACCESS_TOKEN_ISSUER)
    .setAudience(options.audience ?? ACCESS_TOKEN_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TTL)
    .sign(options.key ?? accessKey);
}

const setStatus = (accountId: string, trangThai: TaiKhoan['trangThai']) =>
  db.getRepository(TaiKhoan).update({ taiKhoanId: accountId }, { trangThai });

// ---------- đọc token ----------

describe('JwtAuthGuard — thiếu token (DN-25, SE-05, DM-05)', () => {
  it.each([
    '/guard-probe/login-only',
    '/guard-probe/admin',
    '/guard-probe/staff',
  ])(
    'GET %s không có header Authorization ⇒ 401 CHUA_DANG_NHAP',
    async (path) => {
      expectError(await call(path), 401, AUTH_ERROR_CODES.NOT_LOGGED_IN);
    },
  );

  it('scheme khác Bearer (Basic) ⇒ 401 CHUA_DANG_NHAP', async () => {
    const res = await request(app.getHttpServer())
      .get('/guard-probe/login-only')
      .set('Authorization', 'Basic YWJjOmRlZg==');
    expectError(res, 401, AUTH_ERROR_CODES.NOT_LOGGED_IN);
  });

  it('chỉ nhận token ở header: token hợp lệ nhưng đặt trong cookie hoặc query string ⇒ 401 CHUA_DANG_NHAP', async () => {
    const { accessToken } = await login();
    const viaCookie = await request(app.getHttpServer())
      .get('/guard-probe/login-only')
      .set('Cookie', [
        `access_token=${accessToken}`,
        `refresh_token=${accessToken}`,
      ]);
    const viaQuery = await request(app.getHttpServer()).get(
      `/guard-probe/login-only?access_token=${accessToken}`,
    );
    expectError(viaCookie, 401, AUTH_ERROR_CODES.NOT_LOGGED_IN);
    expectError(viaQuery, 401, AUTH_ERROR_CODES.NOT_LOGGED_IN);
  });

  it('scheme "bearer" viết thường vẫn được chấp nhận (RFC 7235)', async () => {
    const { accessToken } = await login();
    const res = await request(app.getHttpServer())
      .get('/guard-probe/login-only')
      .set('Authorization', `bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });
});

// ---------- token sai ----------

describe('JwtAuthGuard — token sai chữ ký, alg, hạn (DN-25, SE-06)', () => {
  const INVALID = AUTH_ERROR_CODES.INVALID_TOKEN;

  it('chuỗi rác không phải JWT ⇒ 401 TOKEN_KHONG_HOP_LE', async () => {
    expectError(
      await call('/guard-probe/login-only', 'khong.phai.jwt'),
      401,
      INVALID,
    );
  });

  it('SE-06: token ký bằng khoá REFRESH (khoá riêng cho access và refresh) ⇒ 401 TOKEN_KHONG_HOP_LE', async () => {
    const { accountId, sessionId } = await login();
    const token = await forge({
      sub: accountId,
      sid: sessionId,
      key: refreshKey,
    });
    expectError(await call('/guard-probe/login-only', token), 401, INVALID);
  });

  it('DN-25: alg none (không chữ ký) với claims đúng của một phiên đang sống ⇒ 401 TOKEN_KHONG_HOP_LE', async () => {
    const { accountId, sessionId } = await login();
    const now = Math.floor(Date.now() / 1000);
    const token = new UnsecuredJWT({ sid: sessionId })
      .setSubject(accountId)
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + ACCESS_TTL)
      .encode();
    expectError(await call('/guard-probe/login-only', token), 401, INVALID);
  });

  it('SE-06: alg cố định HS256, token HS512 ký bằng đúng khoá access ⇒ 401 TOKEN_KHONG_HOP_LE', async () => {
    const { accountId, sessionId } = await login();
    const good = await forge({ sub: accountId, sid: sessionId });
    const other = await forge({ sub: accountId, sid: sessionId, alg: 'HS512' });
    // Đối chứng: cùng claims và cùng khoá, chỉ khác alg
    expect((await call('/guard-probe/login-only', good)).status).toBe(200);
    expectError(await call('/guard-probe/login-only', other), 401, INVALID);
  });

  it('sửa payload (đổi sub sang tài khoản khác) mà giữ chữ ký cũ ⇒ 401 TOKEN_KHONG_HOP_LE', async () => {
    const { accessToken } = await login();
    const [header, payload, signature] = accessToken.split('.') as [
      string,
      string,
      string,
    ];
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    const tampered = Buffer.from(
      JSON.stringify({ ...claims, sub: '999' }),
    ).toString('base64url');
    expectError(
      await call(
        '/guard-probe/login-only',
        `${header}.${tampered}.${signature}`,
      ),
      401,
      INVALID,
    );
  });

  it.each([
    ['sai issuer', { issuer: 'ke-tan-cong' }],
    ['sai audience', { audience: 'ung-dung-khac' }],
  ])('%s ⇒ 401 TOKEN_KHONG_HOP_LE', async (_ten, options) => {
    const { accountId, sessionId } = await login();
    const token = await forge({ sub: accountId, sid: sessionId, ...options });
    expectError(await call('/guard-probe/login-only', token), 401, INVALID);
  });

  it('DN-25, DM-05: hết hạn — còn dùng được ở giây 899, hết ở giây 901 (access sống 15 phút)', async () => {
    const { accessToken } = await login();
    advanceTo(ACCESS_TTL - 1);
    expect((await call('/guard-probe/login-only', accessToken)).status).toBe(
      200,
    );
    advanceTo(ACCESS_TTL + 1);
    expectError(
      await call('/guard-probe/login-only', accessToken),
      401,
      INVALID,
    );
  });
});

// ---------- phiên và tài khoản ----------

describe('JwtAuthGuard — tra phiên theo sid ở MỌI request (DN-35, DX-02)', () => {
  const INACTIVE = AUTH_ERROR_CODES.SESSION_INACTIVE;

  it('DX-02: đăng xuất (thu hồi phiên) ⇒ chính access token cũ bị từ chối NGAY dù còn 15 phút hạn', async () => {
    const { accessToken, sessionId } = await login();
    expect((await call('/guard-probe/login-only', accessToken)).status).toBe(
      200,
    );

    await sessions.revoke(sessionId);

    expectError(
      await call('/guard-probe/login-only', accessToken),
      401,
      INACTIVE,
    );
  });

  it('DN-35: access token của phiên đã thu hồi ⇒ 401 PHIEN_HET_HIEU_LUC, kể cả thu hồi hàng loạt (khoá tài khoản)', async () => {
    const { accessToken, accountId } = await login();
    await sessions.revokeAll(accountId);
    expectError(
      await call('/guard-probe/login-only', accessToken),
      401,
      INACTIVE,
    );
  });

  it('DN-35: access token cấp lúc 7:59 (exp bị kẹp ở mốc 8 giờ) dùng được lúc 7:59:30, dùng lúc 8:05 ⇒ 401', async () => {
    const { accountId, sessionId } = await login();
    advanceTo(MAX - 60); // 7:59:00 — mô phỏng lần làm mới cuối cùng trước trần
    const token = await signFor(accountId, sessionId, at(MAX));

    advanceTo(MAX - 30);
    expect((await call('/guard-probe/login-only', token)).status).toBe(200);

    advanceTo(MAX + 5 * 60); // 8:05:00
    // Chặn ngay ở hạn của chính token (exp = đúng 8 giờ), trước cả bước tra phiên
    expectError(
      await call('/guard-probe/login-only', token),
      401,
      AUTH_ERROR_CODES.INVALID_TOKEN,
    );
  });

  it('DN-35, H14: token CÒN hạn nhưng phiên quá trần 8 giờ ⇒ 401 PHIEN_HET_HIEU_LUC (7:59:59 qua, đúng 8:00:00 thì không)', async () => {
    const { accountId, sessionId } = await login();
    // Ký lúc 7:59:30 với notAfter xa nên exp = 8:14:30, VƯỢT trần phiên (mô phỏng lỗi cấp token hoặc token bị rò):
    // JWT còn hạn, chỉ bước tra phiên (tao_luc + 8 giờ) mới chặn được
    advanceTo(MAX - 30);
    const token = await signFor(accountId, sessionId, at(24 * 3600));

    advanceTo(MAX - 1);
    expect((await call('/guard-probe/login-only', token)).status).toBe(200);

    advanceTo(MAX);
    expectError(await call('/guard-probe/login-only', token), 401, INACTIVE);
    advanceTo(MAX + 5 * 60);
    expectError(await call('/guard-probe/login-only', token), 401, INACTIVE);
  });

  it('H14: guard KHÔNG đo hạn không hoạt động 30 phút (chỉ đo ở lần làm mới); phiên im lặng 2 giờ vẫn qua nếu token còn hạn', async () => {
    const { accountId, sessionId } = await login();
    advanceTo(2 * 3600);
    const token = await signFor(accountId, sessionId, at(MAX));
    expect((await call('/guard-probe/login-only', token)).status).toBe(200);
  });

  it('phiên không tồn tại ⇒ 401 PHIEN_HET_HIEU_LUC', async () => {
    const { accountId } = await login();
    const token = await forge({ sub: accountId, sid: '987654321' });
    expectError(await call('/guard-probe/login-only', token), 401, INACTIVE);
  });

  it('token đúng chữ ký nhưng sid thuộc tài khoản khác ⇒ 401 PHIEN_HET_HIEU_LUC', async () => {
    const victim = await login('QuanTriVien');
    const attacker = await login('BenhNhan');
    const token = await forge({
      sub: attacker.accountId,
      sid: victim.sessionId,
    });
    expectError(await call('/guard-probe/admin', token), 401, INACTIVE);
  });

  it('tài khoản NgungHoatDong ⇒ 401 PHIEN_HET_HIEU_LUC ngay; trạng thái được đọc ở mỗi request nên mở lại là qua', async () => {
    const { accessToken, accountId } = await login();
    await setStatus(accountId, 'NgungHoatDong');
    expectError(
      await call('/guard-probe/login-only', accessToken),
      401,
      INACTIVE,
    );

    await setStatus(accountId, 'DangHoatDong');
    expect((await call('/guard-probe/login-only', accessToken)).status).toBe(
      200,
    );
  });

  it('tài khoản ChoKichHoat (kể cả có phiên lạc) ⇒ 401 PHIEN_HET_HIEU_LUC', async () => {
    const account = await insertTaiKhoan(db, {
      loaiTaiKhoan: 'LeTan',
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
    });
    const stray = await insertPhienDangNhap(db, account.taiKhoanId, {
      taoLuc: T0,
    });
    const token = await signFor(
      account.taiKhoanId,
      stray.phienDangNhapId,
      at(MAX),
    );
    expectError(await call('/guard-probe/staff', token), 401, INACTIVE);
  });
});

// ---------- vai trò ----------

describe('RolesGuard — vai trò qua HTTP (DN-26, SE-05, DM-05)', () => {
  const FORBIDDEN = AUTH_ERROR_CODES.FORBIDDEN;

  it.each(LOAI_TAI_KHOAN)(
    'DN-26: vai trò %s — /admin chỉ QuanTriVien, /staff chỉ BacSi và LeTan, /login-only mọi vai trò',
    async (role) => {
      const { accessToken } = await login(role);

      const admin = await call('/guard-probe/admin', accessToken);
      const staff = await call('/guard-probe/staff', accessToken);
      const loginOnly = await call('/guard-probe/login-only', accessToken);

      if (role === 'QuanTriVien') expect(admin.status).toBe(200);
      else expectError(admin, 403, FORBIDDEN);
      if (role === 'BacSi' || role === 'LeTan') expect(staff.status).toBe(200);
      else expectError(staff, 403, FORBIDDEN);
      expect(loginOnly.status).toBe(200);
    },
  );

  it('SE-05: thiếu token ⇒ 401 (không phải 403); đủ token nhưng sai vai trò ⇒ 403 (không phải 401)', async () => {
    const { accessToken } = await login('BenhNhan');
    expectError(
      await call('/guard-probe/admin'),
      401,
      AUTH_ERROR_CODES.NOT_LOGGED_IN,
    );
    expectError(await call('/guard-probe/admin', accessToken), 403, FORBIDDEN);
  });

  it('DM-05: route chỉ cần đăng nhập — thiếu token 401, hết hạn 401, hợp lệ 200', async () => {
    const { accessToken } = await login('BenhNhan');
    expectError(
      await call('/guard-probe/login-only'),
      401,
      AUTH_ERROR_CODES.NOT_LOGGED_IN,
    );
    expect((await call('/guard-probe/login-only', accessToken)).status).toBe(
      200,
    );
    advanceTo(ACCESS_TTL + 1);
    expectError(
      await call('/guard-probe/login-only', accessToken),
      401,
      AUTH_ERROR_CODES.INVALID_TOKEN,
    );
  });

  it('vai trò đọc từ DB mỗi request, không từ token: đổi vai trò trong DB có hiệu lực ngay với token cũ', async () => {
    const { accessToken, accountId } = await login('BenhNhan');
    expectError(await call('/guard-probe/admin', accessToken), 403, FORBIDDEN);

    await db
      .getRepository(TaiKhoan)
      .update({ taiKhoanId: accountId }, { loaiTaiKhoan: 'QuanTriVien' });
    expect((await call('/guard-probe/admin', accessToken)).status).toBe(200);

    await db
      .getRepository(TaiKhoan)
      .update({ taiKhoanId: accountId }, { loaiTaiKhoan: 'BacSi' });
    expectError(await call('/guard-probe/admin', accessToken), 403, FORBIDDEN);
  });

  it('@CurrentUser() trả đúng { accountId, sessionId, role } và không lộ trường nào khác', async () => {
    const { accessToken, accountId, sessionId } = await login('LeTan');
    const res = await call('/guard-probe/login-only', accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      user: { accountId, sessionId, role: 'LeTan' },
    });
  });

  it('thứ tự guard: RolesGuard thấy người dùng do JwtAuthGuard gắn (QuanTriVien hợp lệ vào được /admin)', async () => {
    const { accessToken } = await login('QuanTriVien');
    expect((await call('/guard-probe/admin', accessToken)).status).toBe(200);
  });
});

// ---------- @Public ----------

describe('@Public() và mặc định cần đăng nhập', () => {
  it('GET /health công khai: 200 không cần token (Docker HEALTHCHECK và bước kiểm sau CD)', async () => {
    const res = await call('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('route @Public không đọc token: không token và token rác đều 200', async () => {
    expect((await call('/guard-probe/open')).status).toBe(200);
    expect((await call('/guard-probe/open', 'rac.khong.hop.le')).status).toBe(
      200,
    );
  });

  it('@Public + @Roles là cấu hình sai: đóng mặc định ⇒ 401 CHUA_DANG_NHAP, kể cả khi gửi token QuanTriVien hợp lệ', async () => {
    const { accessToken } = await login('QuanTriVien');
    expectError(
      await call('/guard-probe/open-with-roles', accessToken),
      401,
      AUTH_ERROR_CODES.NOT_LOGGED_IN,
    );
  });

  it('@CurrentUser() ở route @Public (không có người dùng) ⇒ 401 CHUA_DANG_NHAP, không lỗi 500', async () => {
    expectError(
      await call('/guard-probe/open-with-current-user'),
      401,
      AUTH_ERROR_CODES.NOT_LOGGED_IN,
    );
  });

  it('route không tồn tại vẫn 404 (guard không biến 404 thành 401)', async () => {
    expect((await call('/guard-probe/khong-co')).status).toBe(404);
  });
});
