import {
  Controller,
  Get,
  Inject,
  Module,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { AuthModule } from './../src/auth/auth.module.js';
import { Public } from './../src/auth/decorators/public.decorator.js';
import { OriginGuard } from './../src/auth/guards/origin.guard.js';
import { RefreshCookieService } from './../src/auth/session/refresh-cookie.service.js';
import { TEST_AUTH_ENV } from './../src/auth/testing/auth-test-env.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';

// Task A3. Test case: DN-33 (cookie refresh), DN-34 và DX-07 (Origin), qua HTTP thật với AppModule + MySQL thật.
// Endpoint thật (refresh, logout) thuộc A9/A10; ở đây dùng controller thử chỉ tồn tại trong file test này.
// @Public vì guard đăng nhập toàn cục (A4) chặn mọi route mặc định; các ca ở đây chỉ kiểm cookie và Origin, không kiểm đăng nhập.
@Public()
@Controller('probe')
class ProbeController {
  constructor(
    @Inject(RefreshCookieService)
    private readonly cookies: RefreshCookieService,
  ) {}

  @Post('set')
  set(@Res({ passthrough: true }) res: Response) {
    this.cookies.set(res, 'token-gia', new Date('2026-10-27T01:30:00.000Z'));
    return { ok: true };
  }

  @Post('clear')
  clear(@Res({ passthrough: true }) res: Response) {
    this.cookies.clear(res);
    return { ok: true };
  }

  @Get('read')
  read(@Req() req: Request) {
    return { value: this.cookies.read(req) ?? null };
  }

  @UseGuards(OriginGuard)
  @Post('guarded')
  guarded() {
    return { ok: true };
  }
}

@Module({ imports: [AuthModule], controllers: [ProbeController] })
class ProbeModule {}

// Tách "Set-Cookie" thành tên=giá trị và tập thuộc tính (chữ thường) để so sánh không phụ thuộc thứ tự
function parseSetCookie(header: string) {
  const [pair, ...attributes] = header.split('; ');
  return {
    pair,
    attributes: attributes.map((attribute) => attribute.toLowerCase()),
  };
}

describe('cookie refresh và OriginGuard qua HTTP (DN-33, DN-34, DX-07)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ProbeModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app); // đúng cấu hình như main.ts (có cookie-parser)
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('DN-33: Set-Cookie có HttpOnly, Secure, SameSite=Lax, Path=/api/auth, Expires đúng mốc và không có Max-Age', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe/set')
      .expect(201);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies).toHaveLength(1);
    const { pair, attributes } = parseSetCookie(cookies[0] as string);
    expect(pair).toBe('refresh_token=token-gia');
    expect(attributes).toEqual(
      expect.arrayContaining([
        'path=/api/auth',
        'httponly',
        'secure',
        'samesite=lax',
        'expires=tue, 27 oct 2026 01:30:00 gmt',
      ]),
    );
    expect(
      attributes.some((attribute) => attribute.startsWith('max-age')),
    ).toBe(false);
  });

  it('xoá cookie: giá trị rỗng, hết hạn trong quá khứ, cùng Path/Secure/SameSite/HttpOnly', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe/clear')
      .expect(201);
    const { pair, attributes } = parseSetCookie(
      (res.headers['set-cookie'] as unknown as string[])[0] as string,
    );
    expect(pair).toBe('refresh_token=');
    expect(attributes).toEqual(
      expect.arrayContaining([
        'path=/api/auth',
        'httponly',
        'secure',
        'samesite=lax',
        'expires=thu, 01 jan 1970 00:00:00 gmt',
      ]),
    );
  });

  it('đọc cookie qua cookie-parser; không có cookie hoặc cookie khác tên thì null', async () => {
    const withCookie = await request(app.getHttpServer())
      .get('/probe/read')
      .set('Cookie', 'refresh_token=abc.def.ghi');
    expect(withCookie.body).toEqual({ value: 'abc.def.ghi' });
    expect(
      (await request(app.getHttpServer()).get('/probe/read')).body,
    ).toEqual({ value: null });
    expect(
      (
        await request(app.getHttpServer())
          .get('/probe/read')
          .set('Cookie', 'khac=1')
      ).body,
    ).toEqual({ value: null });
  });

  it('DN-34 / DX-07: Origin đúng WEB_ORIGIN thì qua', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe/guarded')
      .set('Origin', TEST_AUTH_ENV.WEB_ORIGIN);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });

  it.each([
    ['sai', 'http://evil.example.com'],
    ['khác cổng', 'http://localhost:3000'],
    ['"null"', 'null'],
    ['có dấu / ở cuối', `${TEST_AUTH_ENV.WEB_ORIGIN}/`],
  ])(
    'DN-34 / DX-07: Origin %s → 403 ORIGIN_KHONG_HOP_LE',
    async (_label, origin) => {
      const res = await request(app.getHttpServer())
        .post('/probe/guarded')
        .set('Origin', origin);
      expectErrorResponse(res, 403, 'ORIGIN_KHONG_HOP_LE');
    },
  );

  it('DN-34 / DX-07: vắng header Origin → 403', async () => {
    const res = await request(app.getHttpServer()).post('/probe/guarded');
    expectErrorResponse(res, 403, 'ORIGIN_KHONG_HOP_LE');
  });
});
