import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { ProfileResponse } from './profile.dto.js';
import { ProfileService } from './profile.service.js';

// Hồ sơ cá nhân của người đang đăng nhập (task B1; PLAN patient 5.2, 5.7; TRACKING B1-F). Controller chỉ nhận/trả; logic ở ProfileService.
//  - `@Roles` ghi rõ trên route, kể cả khi cho cả bốn vai trò (QP-08: không route nào chỉ dựa vào guard đăng nhập).
//  - Tài khoản chỉ lấy từ access token qua `CurrentUser()`; không khai @Query/@Param/@Body nên `?taiKhoanId=…` bị bỏ qua (QP-05).
//  - Quản trị viên: không RequireAdminScope, vì chỉ đọc hàng của chính mình (cả hai phạm vi đều được).
@Controller('profile')
export class ProfileController {
  constructor(
    @Inject(ProfileService) private readonly service: ProfileService,
  ) {}

  @Get()
  @Roles('BenhNhan', 'BacSi', 'LeTan', 'QuanTriVien')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ProfileResponse> {
    // Dữ liệu cá nhân: không cho trình duyệt hay proxy lưu lại. Đặt trước khi gọi service để nhánh lỗi cũng có
    res.setHeader('Cache-Control', 'no-store');
    return this.service.getProfile(user.accountId);
  }
}
