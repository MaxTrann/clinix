import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator.js';
import { MeService, type MeResponse } from './me.service.js';

// Hồ sơ người đang đăng nhập (task A15; PLAN 5.1; TRACKING A15-A…). Controller chỉ nhận/trả; logic ở MeService.
//  - CẦN ĐĂNG NHẬP (không `Public()`), mọi vai trò (không `Roles()`): tài khoản chỉ lấy từ access token qua `CurrentUser()`; query và thân không được đọc.
//  - Không OriginGuard: xác thực bằng header Authorization, trình duyệt không tự gửi; endpoint chỉ đọc, không có Set-Cookie.
@Controller('auth')
export class MeController {
  constructor(@Inject(MeService) private readonly service: MeService) {}

  @Get('me')
  async me(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    // Dữ liệu cá nhân: không cho trình duyệt hay proxy lưu lại. Đặt trước khi gọi service để nhánh lỗi cũng có
    res.setHeader('Cache-Control', 'no-store');
    return this.service.getProfile(user.accountId);
  }
}
