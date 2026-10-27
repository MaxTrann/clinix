import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import { TEST_AUTH_ENV } from '../auth/testing/auth-test-env.js';
import { fakeSecretValue } from '../common/testing/sample-secrets.js';
import {
  validateEnv,
  type EnvironmentVariables,
} from '../config/env.validation.js';
import { MailModule } from './mail.module.js';
import { MailService } from './mail.service.js';
import { SmtpMailService } from './smtp-mail.service.js';

// Task P4. Nối biến môi trường (đã qua validateEnv) vào MailService qua MailModule. Mã nội bộ MAIL-28… là [đề xuất].
// ConfigService đọc process.env trước giá trị truyền vào, nên gỡ mọi biến email của máy đang chạy test để kết quả không phụ thuộc máy.
const MAIL_VARIABLES = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'MAIL_FROM_NAME',
  'MAIL_FROM_ADDRESS',
  'MAIL_SUPPORT_ADDRESS',
];
const BASE = {
  MYSQL_DATABASE: 'clinix',
  MYSQL_USER: 'clinix',
  MYSQL_PASSWORD: 'mat-khau-gia',
  ...TEST_AUTH_ENV,
};
const PASS = fakeSecretValue('smtp');

beforeEach(() => {
  for (const name of MAIL_VARIABLES) vi.stubEnv(name, undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function mailServiceFor(
  raw: Record<string, unknown>,
): Promise<MailService> {
  const env = validateEnv({ ...BASE, ...raw });
  @Global()
  @Module({
    providers: [
      {
        provide: ConfigService,
        useValue: new ConfigService<EnvironmentVariables, true>(
          env as unknown as Record<string, unknown>,
        ),
      },
    ],
    exports: [ConfigService],
  })
  class TestConfigModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [TestConfigModule, MailModule],
  }).compile();
  return moduleRef.get(MailService);
}

describe('MailModule (MAIL-28)', () => {
  it('đủ biến SMTP: MailService là SmtpMailService, mang đúng cấu hình và tuỳ chọn transport (host, cổng, tài khoản, TLS)', async () => {
    const service = await mailServiceFor({
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '587',
      SMTP_USER: 'clinix@example.test',
      SMTP_PASS: PASS,
      MAIL_FROM_NAME: 'Phòng khám CLINIX',
      MAIL_FROM_ADDRESS: 'gui@example.test',
      MAIL_SUPPORT_ADDRESS: 'hotro@example.test',
    });

    expect(service).toBeInstanceOf(SmtpMailService);
    expect(Reflect.get(service, 'config')).toEqual({
      host: 'smtp.example.test',
      port: 587,
      user: 'clinix@example.test',
      pass: PASS,
      fromName: 'Phòng khám CLINIX',
      fromAddress: 'gui@example.test',
      supportAddress: 'hotro@example.test',
    });
    const transport = Reflect.get(service, 'transport') as {
      transporter: { options: Record<string, unknown> };
    };
    expect(transport.transporter.options).toMatchObject({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'clinix@example.test', pass: PASS },
    });
  });

  it('cổng mặc định 465 → TLS ngay từ đầu; địa chỉ gửi mặc định là SMTP_USER; tên người gửi mặc định CLINIX', async () => {
    const service = await mailServiceFor({
      SMTP_HOST: 'smtp.example.test',
      SMTP_USER: 'clinix@example.test',
      SMTP_PASS: PASS,
    });

    expect(Reflect.get(service, 'config')).toMatchObject({
      port: 465,
      fromName: 'CLINIX',
      fromAddress: 'clinix@example.test',
    });
    const transport = Reflect.get(service, 'transport') as {
      transporter: { options: Record<string, unknown> };
    };
    expect(transport.transporter.options).toMatchObject({
      secure: true,
      requireTLS: false,
    });
  });

  it('không có biến SMTP (dev/test): vẫn khởi động, nhưng không có cấu hình và không có transport', async () => {
    const service = await mailServiceFor({});

    expect(service).toBeInstanceOf(SmtpMailService);
    expect(Reflect.get(service, 'config')).toBeNull();
    expect(Reflect.get(service, 'transport')).toBeNull();
    await expect(
      service.send({ to: 'a@example.test', subject: 'S', text: 'T' }),
    ).rejects.toMatchObject({ kind: 'NOT_CONFIGURED' });
  });
});
