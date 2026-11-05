import { Body, Controller, Get, Inject, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
// Import GIÁ TRỊ (không `import type`) cho UpdateProfileDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không thân không được kiểm
import { UpdateProfileDto, type ProfileResponse } from './profile.dto.js';
import { ProfileService } from './profile.service.js';

// Hồ sơ cá nhân của người đang đăng nhập (task B1 GET, B2 PUT; PLAN patient 5.2, 5.7; TRACKING B1-F, B2-F). Controller chỉ nhận/trả; logic ở ProfileService.
//  - `@Roles` ghi rõ trên từng route, kể cả khi cho cả bốn vai trò (QP-08: không route nào chỉ dựa vào guard đăng nhập).
//  - Tài khoản chỉ lấy từ access token qua `CurrentUser()`; không khai @Query/@Param nên `?taiKhoanId=…` bị bỏ qua (QP-05). PUT có thân
//    `UpdateProfileDto` (chỉ năm trường, `taiKhoanId` trong thân là 400).
//  - Quản trị viên: không RequireAdminScope, vì chỉ đọc/ghi hàng của chính mình (cả hai phạm vi đều được). Không OriginGuard: xác thực bằng header
//    Authorization (trình duyệt không tự gửi), không cookie nên không có CSRF.
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

  // PUT thay cả bộ năm trường; 200 trả hồ sơ ĐỌC LẠI từ DB (không phản chiếu thân). Chuyển TƯỜNG MINH năm trường, không truyền nguyên DTO,
  // để thuộc tính thừa (nếu có ai gán sau pipe) không bao giờ tới tầng ghi.
  @Put()
  @Roles('BenhNhan', 'BacSi', 'LeTan', 'QuanTriVien')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ProfileResponse> {
    // Đặt trước khi gọi service để nhánh lỗi (401, 500) cũng có
    res.setHeader('Cache-Control', 'no-store');
    return this.service.updateProfile(user.accountId, {
      hoTen: dto.hoTen,
      soDienThoai: dto.soDienThoai,
      gioiTinh: dto.gioiTinh,
      ngaySinh: dto.ngaySinh,
      diaChi: dto.diaChi,
    });
  }
}
