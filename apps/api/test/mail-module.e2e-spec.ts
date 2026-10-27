import {
  Body,
  Controller,
  Inject,
  Module,
  Post,
  type INestApplication,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Public } from './../src/auth/decorators/public.decorator.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { MailModule } from './../src/mail/mail.module.js';
import { MailService } from './../src/mail/mail.service.js';
import { SmtpMailService } from './../src/mail/smtp-mail.service.js';
import { renderOtpMail } from './../src/mail/templates/otp-mail.js';
import { FakeMailService } from './../src/mail/testing/fake-mail.service.js';

// Task P4: MailModule đi vào AppModule thật, và cách A2/A5/A11 hay admin sẽ dùng nó (import MailModule, Inject(MailService)).
// Truy vết ĐK b6, QMK b5. Mã nội bộ MAIL-25… là [đề xuất]. Dựng app qua configureApp như main.ts. Không gửi email thật:
// môi trường test ép SMTP_* về rỗng (vitest.test-env.ts), nên MailService thật báo NOT_CONFIGURED và không chạm mạng.
const RECIPIENT = 'benh.nhan@example.com';
const OTP = '482913';

class SendOtpDto {
  // ValidationPipe (whitelist) bỏ/cấm mọi trường không có decorator kiểm dữ liệu
  @IsString()
  to!: string;
}

@Public()
@Controller('mail-probe')
class MailProbeController {
  constructor(@Inject(MailService) private readonly mail: MailService) {}

  @Post('otp')
  async sendOtp(@Body() body: SendOtpDto): Promise<{ ok: true }> {
    const rendered = renderOtpMail({
      kind: 'register',
      otp: OTP,
      expiresInMinutes: 10,
    });
    await this.mail.send({ to: body.to, ...rendered });
    return { ok: true };
  }
}

// Mô phỏng một module nghiệp vụ dùng MailService đúng cách: import MailModule
@Module({
  imports: [AppModule, MailModule],
  controllers: [MailProbeController],
})
class ProbeModule {}

async function createApp(
  configure?: (builder: ReturnType<typeof Test.createTestingModule>) => void,
): Promise<NestExpressApplication> {
  const builder = Test.createTestingModule({ imports: [ProbeModule] });
  configure?.(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app); // bộ lọc lỗi, ValidationPipe, logger che bí mật như main.ts
  await app.init();
  return app;
}

let output: string[];

beforeEach(() => {
  output = [];
  const capture = (chunk: unknown): boolean => {
    output.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  vi.spyOn(process.stdout, 'write').mockImplementation(capture);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppModule và MailModule (MAIL-30)', () => {
  it('AppModule import MailModule để cấu hình SMTP sai (staging/production thiếu biến) làm API dừng lúc khởi động', () => {
    const imports = Reflect.getMetadata('imports', AppModule) as unknown[];
    expect(imports).toContain(MailModule);
  });
});

describe('MailService thật trong AppModule, chưa cấu hình SMTP (MAIL-25)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('MailService inject được và là SmtpMailService; gửi báo NOT_CONFIGURED, không giả vờ thành công', async () => {
    const mail = app.get(MailService);
    expect(mail).toBeInstanceOf(SmtpMailService);
    await expect(
      mail.send({ to: RECIPIENT, subject: 'Tiêu đề', text: 'Nội dung' }),
    ).rejects.toMatchObject({ name: 'MailSendError', kind: 'NOT_CONFIGURED' });
  });

  it('nơi gọi không bắt lỗi gửi thì client chỉ thấy 500 LOI_HE_THONG, không lộ gì về SMTP, địa chỉ hay mã; log cũng không có địa chỉ và mã', async () => {
    const res = await request(app.getHttpServer())
      .post('/mail-probe/otp')
      .send({ to: RECIPIENT });

    const body = expectErrorResponse(res, 500, 'LOI_HE_THONG');
    expect(Object.keys(body).sort()).toEqual(
      ['maLoi', 'requestId', 'thongBao'].sort(),
    );
    for (const hidden of [RECIPIENT, OTP, 'SMTP', 'NOT_CONFIGURED']) {
      expect(res.text).not.toContain(hidden);
    }
    const logs = output.join('');
    expect(logs).toContain(body.requestId ?? 'requestId-bi-thieu');
    expect(logs).not.toContain(RECIPIENT);
    expect(logs).not.toContain(OTP);
  });
});

describe('thay MailService bằng FakeMailService (MAIL-26, cách A2/A5/A11 và admin kiểm thử)', () => {
  let app: INestApplication;
  const fake = new FakeMailService();
  beforeAll(async () => {
    app = await createApp((builder) =>
      builder.overrideProvider(MailService).useValue(fake),
    );
  });
  beforeEach(() => {
    fake.reset();
  });
  afterAll(async () => {
    await app.close();
  });

  it('gửi thành công: nơi gọi nhận 201 và thư được ghi lại đúng một lần với mã OTP trong thân', async () => {
    const res = await request(app.getHttpServer())
      .post('/mail-probe/otp')
      .send({ to: RECIPIENT });

    expect(res.status).toBe(201);
    expect(fake.attempts).toHaveLength(1);
    expect(fake.sent[0]?.to).toBe(RECIPIENT);
    expect(fake.sent[0]?.subject).toBe(
      '[CLINIX] Mã xác minh OTP đăng ký tài khoản',
    );
    expect(fake.sent[0]?.text).toContain(OTP);
    expect(fake.sent[0]?.text).toContain('10 phút');
  });

  it('gửi lỗi: lỗi lọt tới bộ lọc P5 thành 500 chung, thân không mang loại lỗi hay thông điệp SMTP; lần sau thành công', async () => {
    fake.failNextWith('AUTH');

    const failed = await request(app.getHttpServer())
      .post('/mail-probe/otp')
      .send({ to: RECIPIENT });
    const body = expectErrorResponse(failed, 500, 'LOI_HE_THONG');
    for (const hidden of ['AUTH', 'SMTP', 'từ chối đăng nhập']) {
      expect(JSON.stringify(body)).not.toContain(hidden);
    }
    expect(fake.sent).toHaveLength(0);

    const ok = await request(app.getHttpServer())
      .post('/mail-probe/otp')
      .send({ to: RECIPIENT });
    expect(ok.status).toBe(201);
    expect(fake.attempts).toHaveLength(2);
    expect(fake.sent).toHaveLength(1);
  });
});
