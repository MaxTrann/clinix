import { UploadModule } from './common/upload/upload.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { SystemConfigModule } from './admin/system-config/system-config.module.js';
import { validateEnv } from './config/env.validation.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { MailModule } from './mail/mail.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    SystemConfigModule,
    AuthModule,
    // Task P4: chưa có nơi nào dùng MailService (A2/A5/A11 và admin sẽ import MailModule); đưa vào đây để cấu hình SMTP sai
    // (staging/production thiếu biến) làm API dừng ngay lúc khởi động.
    MailModule,
    UploadModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
