import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';

// @Public: guard đăng nhập toàn cục (task A4) mặc định chặn mọi route, mà HEALTHCHECK của Docker và bước kiểm sau deploy
// gọi /health không có token.
@Public()
@Controller('health')
export class HealthController {
  // Dockerfile (HEALTHCHECK) và bước kiểm tra sau deploy (CD) gọi GET /health.
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
