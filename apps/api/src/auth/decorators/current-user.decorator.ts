import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_ERROR_CODES } from '../auth.constants.js';
import type { LoaiTaiKhoan } from '../entities/enums.js';

// Người dùng hiện tại do JwtAuthGuard gắn vào request sau khi token và phiên đều hợp lệ.
// Vai trò đọc từ DB ở mỗi request (không nằm trong token) nên đổi vai trò hay khoá tài khoản có hiệu lực ngay.
// Có sessionId vì đăng xuất cần thu hồi đúng phiên này và đổi mật khẩu cần giữ lại phiên này (revokeAll … exceptSessionId).
export interface AuthenticatedUser {
  accountId: string;
  sessionId: string;
  role: LoaiTaiKhoan;
}

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

// Route chưa có người dùng (thường do quên bỏ @Public) ⇒ 401 thay vì trả undefined rồi lỗi 500 ở chỗ dùng.
export function currentUserOf(
  request: AuthenticatedRequest,
): AuthenticatedUser {
  if (request.user === undefined) {
    throw new UnauthorizedException(AUTH_ERROR_CODES.NOT_LOGGED_IN);
  }
  return request.user;
}

// Ví dụ: `list(@CurrentUser() user: AuthenticatedUser) { … user.accountId … }`
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser =>
    currentUserOf(context.switchToHttp().getRequest<AuthenticatedRequest>()),
);
