import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

// Cấu hình dùng chung cho app thật (main.ts) và test e2e, để test chạy đúng cấu hình thật.
export function configureApp(app: NestExpressApplication): void {
  // API đứng sau một lớp proxy (nginx / Vite): lấy IP và giao thức thật từ X-Forwarded-*. [đề xuất: 1 lớp]
  app.set('trust proxy', 1);
  // Cần cho cookie refresh token (task A3)
  app.use(cookieParser());
  // Mọi dữ liệu vào đi qua DTO + class-validator; trường lạ bị từ chối.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
}
