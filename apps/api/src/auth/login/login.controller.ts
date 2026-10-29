import { Body, Controller, HttpCode, Inject, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../decorators/public.decorator.js';
import { LoginDto } from '../dto/login.dto.js';
import type { LoaiTaiKhoan } from '../entities/enums.js';
import { RefreshCookieService } from '../session/refresh-cookie.service.js';
import { LoginService } from './login.service.js';

/** Thân phản hồi đăng nhập thành công: ĐÚNG hai trường này (PLAN 5.1). Refresh token chỉ ở cookie; không băm, không dữ liệu đăng ký (DN-23). */
export interface LoginResponse {
  accessToken: string;
  vaiTro: LoaiTaiKhoan;
}

// Đăng nhập (task A8). Controller chỉ nhận/trả; logic ở LoginService. CÔNG KHAI (chưa có access token): `Public()` ở cấp class.
// 200 (không tạo tài nguyên REST mà client đọc lại; như verify-otp của A6) { accessToken, vaiTro } kèm Set-Cookie refresh (HttpOnly, Secure theo
// COOKIE_SECURE, SameSite=Lax, Path=/api/auth, hạn = hạn không hoạt động của phiên: do RefreshCookieService của A3). Mọi nhánh lỗi: không cookie.
@Public()
@Controller('auth/login')
export class LoginController {
  constructor(
    @Inject(LoginService) private readonly login: LoginService,
    @Inject(RefreshCookieService)
    private readonly cookies: RefreshCookieService,
  ) {}

  @Post()
  @HttpCode(200)
  async create(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const { vaiTro, session } = await this.login.login({
      email: dto.email,
      matKhau: dto.matKhau,
    });
    this.cookies.set(res, session.refreshToken, session.refreshTokenExpiresAt);
    // Phản hồi mang token: không cho trình duyệt hay proxy lưu lại
    res.setHeader('Cache-Control', 'no-store');
    return { accessToken: session.accessToken, vaiTro };
  }
}
