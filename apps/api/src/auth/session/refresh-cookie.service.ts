import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from '../auth.constants.js';

const MAX_COOKIE_VALUE_LENGTH = 300;

// Cookie chứa refresh token (Q2): HttpOnly (JavaScript không đọc được), SameSite=Lax, Path=/api/auth (chỉ gửi tới các endpoint auth),
// Secure trừ khi phát triển cục bộ (N5; cấu hình COOKIE_SECURE=false bị validateEnv chặn ngoài NODE_ENV=development).
@Injectable()
export class RefreshCookieService {
  private readonly secure: boolean;

  constructor(
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secure = config.get('COOKIE_SECURE', { infer: true });
  }

  // `expiresAt` là hạn không hoạt động của phiên (het_han_luc), nên cookie trượt theo mỗi lần xoay token [đề xuất]
  set(res: Response, refreshToken: string, expiresAt: Date): void {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      ...this.attributes(),
      expires: expiresAt,
    });
  }

  // Xoá cookie (đăng xuất, làm mới thất bại): thuộc tính Path/Secure/SameSite phải giống lúc đặt thì trình duyệt mới xoá đúng cookie
  clear(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, this.attributes());
  }

  // Đọc từ req.cookies (cần cookie-parser, đã bật trong app.setup.ts). Không có hoặc bất thường ⇒ undefined.
  read(req: Request): string | undefined {
    const value: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
    return typeof value === 'string' &&
      value.length > 0 &&
      value.length <= MAX_COOKIE_VALUE_LENGTH
      ? value
      : undefined;
  }

  private attributes() {
    return {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
    } as const;
  }
}
