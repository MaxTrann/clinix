import {
  Body,
  ConsoleLogger,
  Controller,
  Get,
  Headers,
  Inject,
  Logger,
  Module,
  Post,
  Req,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import type { Request } from 'express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import {
  IsAccountEmail,
  IsAccountPassword,
} from './../src/auth/dto/account-field.decorators.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from './../src/auth/decorators/current-user.decorator.js';
import { Public } from './../src/auth/decorators/public.decorator.js';
import { insertTaiKhoan } from './../src/auth/entities/testing/auth-fixtures.js';
import { SessionService } from './../src/auth/session/session.service.js';
import { sha256Hex } from './../src/auth/session/token.service.js';
import { TEST_AUTH_ENV } from './../src/auth/testing/auth-test-env.js';
import { fakeJwt } from './../src/common/testing/sample-secrets.js';
import { resetTables } from './../src/database/testing/test-database.js';

// Task P5. Test case: SE-04 (quét log toàn bộ luồng tìm mật khẩu/token/OTP mẫu), DM-09 (không ghi mật khẩu cũ/mới vào log).
// Bắt MỌI thứ ghi ra stdout, stderr và console trong lúc chạy các luồng thật qua HTTP (AppModule + MySQL thật + configureApp),
// rồi tìm các giá trị mẫu. Endpoint đổi mật khẩu thật thuộc A13; ở đây controller thử tái hiện cả những lỗi "lỡ log nhầm" của người viết code.

// Giá trị mẫu GIẢ. Mọi cái trong SENTINELS (cộng token thật lấy lúc chạy) không được xuất hiện trong log.
const SAMPLE = {
  password: 'Mat-khau-mau-SE04!',
  oldPassword: 'Mat-khau-cu-DM09!',
  newPassword: 'Mat-khau-moi-DM09!',
  otp: '918273',
  resetToken: fakeJwt('reset-se04'),
  email: 'nguoi.mau.se04@example.com',
  argon2:
    '$argon2id$v=19$m=19456,t=2,p=1$bXVhLXNhbHQtc2UwNA$bXVhLWhhc2gtc2UwNC1tYXUtMDEyMzQ1Njc4OQ',
};

// Bằng chứng về nguy cơ thật: mysql2 chèn sẵn giá trị vào err.sql, nên in thẳng lỗi TypeORM sẽ lộ chúng
const probeState: { rawSql: string } = { rawSql: '' };

class RegisterDto {
  @IsAccountEmail()
  email!: string;

  @IsAccountPassword()
  matKhau!: string;
}

class ChangePasswordDto {
  @IsString()
  matKhauCu!: string;

  @IsAccountPassword()
  matKhauMoi!: string;

  @IsString()
  xacNhan!: string;
}

@Public()
@Controller('log-probe')
class LogProbeController {
  private readonly logger = new Logger('ChangePasswordProbe');

  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return { ok: true, email: dto.email };
  }

  // Lỗi hay gặp: log nguyên DTO và nguyên header
  @Post('change-password')
  changePassword(@Body() dto: ChangePasswordDto, @Req() req: Request) {
    this.logger.log({ goi: 'doi-mat-khau', dto });
    this.logger.warn(`headers=${JSON.stringify(req.headers)}`);
    return { ok: true };
  }

  // Lỗi hay gặp: nhét body và header Authorization vào thông điệp lỗi
  @Post('boom')
  boom(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization: string | undefined,
  ): never {
    throw new Error(
      `gọi dịch vụ thất bại; body=${JSON.stringify(body)}; Authorization: ${authorization ?? ''}; otp: ${SAMPLE.otp}`,
    );
  }

  // Lỗi MySQL thật (UNIQUE) trên dữ liệu có email và mã băm mẫu
  @Get('db')
  async dbError(): Promise<void> {
    const row = { email: SAMPLE.email, matKhauBam: SAMPLE.argon2 };
    await insertTaiKhoan(this.db, row);
    try {
      await insertTaiKhoan(this.db, row);
    } catch (error) {
      probeState.rawSql = String(Reflect.get(error as object, 'sql'));
      throw error;
    }
  }
}

// Không @Public: đi qua JwtAuthGuard thật bằng access token thật
@Controller('log-probe-auth')
class ProtectedProbeController {
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }
}

@Module({
  imports: [AppModule],
  controllers: [LogProbeController, ProtectedProbeController],
})
class ProbeModule {}

// ---------- bắt mọi thứ được ghi ra ----------
const captured: string[] = [];
let app: NestExpressApplication;
let sentinels: Record<string, string>;
let requestIds: string[];
let reusedSessionId: string;

function startCapture() {
  const chunkToText = (chunk: unknown) =>
    typeof chunk === 'string'
      ? chunk
      : Buffer.from(chunk as Uint8Array).toString('utf8');
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    captured.push(chunkToText(chunk));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    captured.push(chunkToText(chunk));
    return true;
  });
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      captured.push(args.map(String).join(' '));
    });
  }
}

const logText = () => captured.join('');

beforeAll(async () => {
  startCapture(); // bắt từ trước khi dựng app để cả log lúc khởi động cũng nằm trong phép quét
  const moduleRef = await Test.createTestingModule({
    imports: [ProbeModule],
  }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app); // đúng cấu hình như main.ts (logger che bí mật, bộ lọc lỗi, ValidationPipe)
  await app.init();
  const db = app.get(DataSource);
  await resetTables(db);

  const server = app.getHttpServer();
  const sessions = app.get(SessionService);
  const account = await insertTaiKhoan(db, {
    email: 'tai.khoan.phien@example.com',
  });
  const issued = await sessions.create(account.taiKhoanId);

  // Mọi giá trị mẫu cần tìm trong log (tên để thông báo lỗi chỉ rõ cái nào lọt)
  sentinels = {
    matKhau: SAMPLE.password,
    matKhauCu: SAMPLE.oldPassword,
    matKhauMoi: SAMPLE.newPassword,
    otp: SAMPLE.otp,
    resetToken: SAMPLE.resetToken,
    maBamArgon2: SAMPLE.argon2,
    emailTrongLoiMySQL: SAMPLE.email,
    accessToken: issued.accessToken,
    chuKyAccessToken: issued.accessToken.split('.')[2] ?? 'thieu-chu-ky',
    refreshToken: issued.refreshToken,
    phanNgauNhienRefreshToken: issued.refreshToken.split('.')[1] ?? 'thieu',
    bamSha256CuaRefreshToken: sha256Hex(issued.refreshToken),
    khoaKyAccessToken: TEST_AUTH_ENV.JWT_ACCESS_SECRET,
    khoaKyRefreshToken: TEST_AUTH_ENV.JWT_REFRESH_SECRET,
  };

  // ---- Các luồng ----
  const bearer = { Authorization: `Bearer ${issued.accessToken}` };
  requestIds = [];

  // 1) Đăng ký sai định dạng, mật khẩu mẫu nằm trong body (4xx, không log lỗi)
  expect(
    (
      await request(server)
        .post('/log-probe/register')
        .send({ email: 'sai', matKhau: SAMPLE.password })
    ).status,
  ).toBe(400);

  // 2) JSON hỏng có mật khẩu mẫu trong body
  expect(
    (
      await request(server)
        .post('/log-probe/register')
        .set('Content-Type', 'application/json')
        .send(`{"matKhau": "${SAMPLE.password}", oops`)
    ).status,
  ).toBe(400);

  // 3) Đổi mật khẩu: DTO hợp lệ, handler log nhầm DTO và header (Authorization + Cookie refresh)
  expect(
    (
      await request(server)
        .post('/log-probe/change-password')
        .set(bearer)
        .set('Cookie', `refresh_token=${issued.refreshToken}`)
        .send({
          matKhauCu: SAMPLE.oldPassword,
          matKhauMoi: SAMPLE.newPassword,
          xacNhan: SAMPLE.newPassword,
        })
    ).status,
  ).toBe(201);

  // 4) Lỗi 5xx có thông điệp chứa body, header Authorization, OTP, resetToken
  const boom = await request(server).post('/log-probe/boom').set(bearer).send({
    matKhau: SAMPLE.password,
    otp: SAMPLE.otp,
    resetToken: SAMPLE.resetToken,
  });
  expect(boom.status).toBe(500);
  requestIds.push((boom.body as { requestId: string }).requestId);

  // 5) Lỗi MySQL thật
  const dbError = await request(server).get('/log-probe/db');
  expect(dbError.status).toBe(500);
  requestIds.push((dbError.body as { requestId: string }).requestId);

  // 6) Đi qua JwtAuthGuard: token đúng, thiếu token, token rác
  expect(
    (await request(server).get('/log-probe-auth/me').set(bearer)).status,
  ).toBe(200);
  expect((await request(server).get('/log-probe-auth/me')).status).toBe(401);
  expect(
    (
      await request(server)
        .get('/log-probe-auth/me')
        .set('Authorization', `Bearer ${SAMPLE.resetToken}`)
    ).status,
  ).toBe(401);

  // 7) Làm mới rồi dùng lại token cũ ⇒ SessionService ghi cảnh báo "dùng lại refresh token"
  const refreshed = await sessions.refresh(issued.refreshToken);
  expect(refreshed.ok).toBe(true);
  if (refreshed.ok) {
    sentinels['accessTokenSauKhiLamMoi'] = refreshed.tokens.accessToken;
    sentinels['refreshTokenSauKhiLamMoi'] = refreshed.tokens.refreshToken;
  }
  const reuse = await sessions.refresh(issued.refreshToken);
  expect(reuse).toEqual({ ok: false, reason: 'REUSE_DETECTED' });
  reusedSessionId = issued.sessionId;
});

afterAll(async () => {
  vi.restoreAllMocks();
  await app.close();
});

describe('SE-04 / DM-09 — quét log', () => {
  it('đối chứng: logger THƯỜNG của Nest làm lộ đủ mọi giá trị mẫu (để phép quét bên dưới không mù)', () => {
    const mark = captured.length;
    new ConsoleLogger({ colors: false }).log(
      Object.values(sentinels).join(' | '),
    );
    const controlText = captured.slice(mark).join('');
    captured.length = mark; // trả bộ nhớ bắt về như trước, để các ca quét bên dưới không dính phần đối chứng
    for (const [name, value] of Object.entries(sentinels)) {
      expect(controlText.includes(value), `đối chứng thiếu ${name}`).toBe(true);
    }
  });

  it('có log để quét: luồng thật đã sinh ra log lỗi và cảnh báo (không phải quét một khoảng trống)', () => {
    expect(logText().length).toBeGreaterThan(500);
    expect(logText()).toContain('ERROR');
    expect(logText()).toContain('WARN');
  });

  it('SE-04: toàn bộ log (khởi động, lỗi 5xx, cảnh báo dùng lại token, đối tượng/header bị log nhầm) không chứa mật khẩu, OTP, token, băm mẫu', () => {
    const text = logText();
    for (const [name, value] of Object.entries(sentinels)) {
      expect(text.includes(value), `LỘ trong log: ${name}`).toBe(false);
    }
  });

  it('DM-09: DTO đổi mật khẩu bị log nhầm — mật khẩu cũ/mới/xác nhận không lộ, nhưng tên trường còn để chẩn đoán', () => {
    const text = logText();
    expect(text).toContain('ChangePasswordProbe');
    expect(text).toContain('matKhauCu');
    expect(text).toContain('matKhauMoi');
    expect(text).toContain('[REDACTED]');
    expect(text).not.toContain(SAMPLE.oldPassword);
    expect(text).not.toContain(SAMPLE.newPassword);
  });

  it('che không làm mất chẩn đoán: requestId của từng lỗi 500, đường dẫn, mã MySQL, tên ràng buộc, mã phiên bị dùng lại', () => {
    const text = logText();
    expect(requestIds).toHaveLength(2);
    for (const id of requestIds) expect(text).toContain(`[${id}]`);
    expect(text).toContain('POST /log-probe/boom → 500');
    expect(text).toContain('GET /log-probe/db → 500');
    expect(text).toContain('code=ER_DUP_ENTRY errno=1062');
    expect(text).toMatch(/Duplicate entry '\[REDACTED\]' for key '[^']+'/);
    expect(text).toContain(
      `Phát hiện dùng lại refresh token của phiên ${reusedSessionId}`,
    );
    expect(text).toContain('log-masking.e2e-spec.ts'); // stack vẫn có đường dẫn mã nguồn
  });

  it('nguy cơ là có thật: lỗi MySQL thô mang giá trị trong err.sql (nên bộ che chỉ giữ code/errno/sqlState, bỏ sql)', () => {
    expect(probeState.rawSql).toContain(SAMPLE.email);
    expect(logText()).not.toContain(SAMPLE.email);
  });

  it('log của TypeORM tắt (logger riêng của TypeORM dùng console, không đi qua bộ che nên không được bật)', () => {
    expect(app.get(DataSource).options.logging).toBeFalsy();
  });
});
