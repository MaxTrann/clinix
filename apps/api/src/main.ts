import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { EnvironmentVariables } from './config/env.validation.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  // Không đặt global prefix: /health nằm ở gốc (Dockerfile HEALTHCHECK gọi thẳng).
  // Tiền tố /api là của proxy (Vite/nginx) và được gỡ trước khi tới API (task P6).
  await app.listen(config.get('API_PORT', { infer: true }));
}
await bootstrap();
