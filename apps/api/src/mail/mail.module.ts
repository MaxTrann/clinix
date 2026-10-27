import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { MailService } from './mail.service.js';
import { createMailService } from './smtp-mail.service.js';

// MailService dùng chung (task P4): auth (A2/A5/A11) và admin (B14/B15) import MailModule rồi `@Inject(MailService)`.
// AppModule import module này để cấu hình SMTP sai bị phát hiện lúc khởi động chứ không phải ở lần gửi OTP đầu tiên.
@Module({
  providers: [
    {
      provide: MailService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        createMailService({
          SMTP_HOST: config.get('SMTP_HOST', { infer: true }),
          SMTP_PORT: config.get('SMTP_PORT', { infer: true }),
          SMTP_USER: config.get('SMTP_USER', { infer: true }),
          SMTP_PASS: config.get('SMTP_PASS', { infer: true }),
          MAIL_FROM_NAME: config.get('MAIL_FROM_NAME', { infer: true }),
          MAIL_FROM_ADDRESS: config.get('MAIL_FROM_ADDRESS', { infer: true }),
          MAIL_SUPPORT_ADDRESS: config.get('MAIL_SUPPORT_ADDRESS', {
            infer: true,
          }),
        }),
    },
  ],
  exports: [MailService],
})
export class MailModule {}
