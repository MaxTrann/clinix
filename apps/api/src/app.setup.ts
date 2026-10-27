import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { validationExceptionFactory } from './common/errors/validation-exception.js';
import { createAppLogger } from './common/logging/sanitizing.logger.js';

// Cấu hình dùng chung cho app thật (main.ts) và test e2e, để test chạy đúng cấu hình thật.
// MỌI test e2e phải dựng app qua hàm này: không có nó thì không có bộ lọc lỗi chuẩn hoá và bộ che log (docs/CODING_CONVENTION.md).
export function configureApp(app: NestExpressApplication): void {
  // Mọi log (của app lẫn của Nest) đi qua logger che mật khẩu/token/OTP (task P5). main.ts cũng đặt logger này
  // cho NestFactory.create để log lúc khởi động đi qua cùng bộ che.
  app.useLogger(createAppLogger());
  // API đứng sau một lớp proxy (nginx / Vite): lấy IP và giao thức thật từ X-Forwarded-*. [đề xuất: 1 lớp]
  app.set('trust proxy', 1);
  // Cần cho cookie refresh token (task A3)
  app.use(cookieParser());
  // Mọi dữ liệu vào đi qua DTO + class-validator; trường lạ bị từ chối. Lỗi kiểm dữ liệu thành 400 DU_LIEU_KHONG_HOP_LE kèm
  // loi[{truong, ma}]. `value: false` để lỗi không bao giờ mang giá trị người dùng gửi (có thể là mật khẩu); Nest chỉ mặc định target.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
      exceptionFactory: validationExceptionFactory,
    }),
  );
  // Mọi lỗi ra ngoài có cùng dạng JSON với mã ổn định; lỗi 500 không lộ chi tiết (task P5).
  app.useGlobalFilters(new AllExceptionsFilter());
}
