import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  // Dockerfile (HEALTHCHECK) và bước kiểm tra sau deploy (CD) gọi GET /health.
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
