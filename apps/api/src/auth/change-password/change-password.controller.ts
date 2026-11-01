import { Body, Controller, HttpCode, Inject, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator.js';
import { ChangePasswordDto } from '../dto/change-password.dto.js';
import { RefreshCookieService } from '../session/refresh-cookie.service.js';
import { ChangePasswordService } from './change-password.service.js';

/** Thân phản hồi đổi mật khẩu thành công (như `{ daXacMinh: true }` của A6). Refresh token mới chỉ ở cookie. */
export interface ChangePasswordResponse {
  daDoiMatKhau: true;
}

// Đổi mật khẩu (task A13; PLAN 5.1, quyết định Q8; TRACKING A13-A…). Controller chỉ nhận/trả; logic ở ChangePasswordService.
//  - CẦN ĐĂNG NHẬP (không `Public()`): tài khoản và phiên lấy từ access token qua `CurrentUser()`, không bao giờ từ thân. Mọi vai trò đều được đổi.
//  - Không dùng OriginGuard: xác thực bằng header Authorization (trình duyệt không tự gửi) nên không có CSRF qua cookie; cookie chỉ được ghi sau khi Bearer hợp lệ.
//  - 200 { daDoiMatKhau: true } + Set-Cookie refresh mới của phiên hiện tại. Không cấp access token mới: cùng `sid`, token đang có vẫn dùng được. Lỗi (kể cả DB) không đặt cookie.
@Controller('auth')
export class ChangePasswordController {
  constructor(
    @Inject(ChangePasswordService)
    private readonly service: ChangePasswordService,
    @Inject(RefreshCookieService)
    private readonly cookies: RefreshCookieService,
  ) {}

  // Không tạo tài nguyên REST mà client đọc lại nên 200, không phải 201 (như reset-password)
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ChangePasswordResponse> {
    // Phản hồi mang token: không cho trình duyệt hay proxy lưu lại
    res.setHeader('Cache-Control', 'no-store');

    const rotated = await this.service.change({
      accountId: user.accountId,
      sessionId: user.sessionId,
      matKhauCu: dto.matKhauCu,
      matKhauMoi: dto.matKhauMoi,
    });
    this.cookies.set(res, rotated.refreshToken, rotated.refreshTokenExpiresAt);
    return { daDoiMatKhau: true };
  }
}
