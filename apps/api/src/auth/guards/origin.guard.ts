import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { EnvironmentVariables } from '../../config/env.validation.js';

// Chỉ cho phép request mà header `Origin` đúng bằng WEB_ORIGIN; sai hoặc vắng ⇒ 403 (Q2, DN-34, DX-07).
// Dùng cho /auth/refresh và /auth/logout: hai endpoint này xác thực bằng cookie nên cần chặn request từ trang web khác,
// bổ sung cho SameSite=Lax. Trình duyệt luôn gửi Origin với POST, nên request hợp lệ của web không bị chặn nhầm.
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowedOrigin: string;

  constructor(
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.allowedOrigin = config.get('WEB_ORIGIN', { infer: true });
  }

  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<Request>().headers.origin;
    if (origin !== undefined && origin === this.allowedOrigin) return true;
    // Mã lỗi ổn định [đề xuất]; dạng JSON trả về do bộ lọc lỗi chung (P5) quyết định
    throw new ForbiddenException('ORIGIN_KHONG_HOP_LE');
  }
}
