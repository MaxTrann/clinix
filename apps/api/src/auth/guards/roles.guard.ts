import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_ERROR_CODES } from '../auth.constants.js';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { LoaiTaiKhoan } from '../entities/enums.js';

// Guard toàn cục chạy SAU JwtAuthGuard (thứ tự khai báo APP_GUARD trong AuthModule): đọc người dùng mà JwtAuthGuard đã gắn.
// Không có @Roles ⇒ cho qua (chỉ cần đăng nhập, việc đó của JwtAuthGuard). Có @Roles mà vai trò không nằm trong danh sách ⇒ 403.
// Có @Roles mà chưa có người dùng (route @Public, hoặc thứ tự guard sai) ⇒ 401: đóng mặc định, không bao giờ cho qua.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<
      LoaiTaiKhoan[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (allowedRoles === undefined) return true;

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (user === undefined) {
      throw new UnauthorizedException(AUTH_ERROR_CODES.NOT_LOGGED_IN);
    }
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException(AUTH_ERROR_CODES.FORBIDDEN);
    }
    return true;
  }
}
