import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_ERROR_CODES } from '../auth.constants.js';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { SessionService } from '../session/session.service.js';
import { TokenService } from '../session/token.service.js';

// "Authorization: Bearer <token>": tên scheme không phân biệt hoa thường (RFC 7235), đúng một dấu cách, token không có khoảng trắng.
const BEARER_HEADER = /^Bearer (\S+)$/i;

function readBearerToken(header: string | undefined): string | null {
  return header?.match(BEARER_HEADER)?.[1] ?? null;
}

// Guard toàn cục (APP_GUARD trong AuthModule): mọi route cần đăng nhập, trừ route có @Public().
// Chỉ đọc token từ header Authorization, không đọc cookie (trình duyệt tự gửi cookie ⇒ mở đường CSRF), query hay body.
// Thứ tự kiểm (H14, Q2): có token → chữ ký và alg cố định (không chạm DB) → phiên theo `sid` chưa thu hồi, chưa quá trần 8 giờ
// → tài khoản DangHoatDong. Hạn "không hoạt động" 30 phút KHÔNG kiểm ở đây, chỉ đo ở lần làm mới.
// Lỗi DB ném thẳng ra (500), không bao giờ cho qua.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readBearerToken(request.headers.authorization);
    if (token === null) {
      throw new UnauthorizedException(AUTH_ERROR_CODES.NOT_LOGGED_IN);
    }

    const claims = await this.tokens.verifyAccessToken(token);
    if (claims === null) {
      throw new UnauthorizedException(AUTH_ERROR_CODES.INVALID_TOKEN);
    }

    // Chữ ký đúng chưa đủ: phiên có thể đã bị thu hồi (đăng xuất, khoá tài khoản…) trong lúc token còn hạn
    const active = await this.sessions.resolveActive(claims);
    if (active === null) {
      throw new UnauthorizedException(AUTH_ERROR_CODES.SESSION_INACTIVE);
    }

    request.user = {
      accountId: active.accountId,
      sessionId: active.sessionId,
      role: active.role,
    };
    return true;
  }
}
