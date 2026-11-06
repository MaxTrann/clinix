import { Body, Controller, Get, Inject, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
// Import GIÁ TRỊ (không `import type`) cho CreateRelativeDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không thân không được kiểm
import {
  CreateRelativeDto,
  type RelativeResponse,
  type RelativesListResponse,
} from './relatives.dto.js';
import { RelativesService } from './relatives.service.js';

// Hồ sơ người thân của Bệnh nhân (task B3 GET và POST; PLAN patient 5.3, 5.7; TRACKING B3-E). Controller chỉ nhận/trả; logic ở RelativesService.
//  - `@Roles('BenhNhan')` DUY NHẤT, ghi trên từng route (QP-08): Lễ tân, Quản trị viên và Bác sĩ nhận 403 (Bác sĩ vẫn bị chặn dù được dùng /profile).
//  - Chủ sở hữu chỉ lấy từ access token qua `CurrentUser()`; không khai @Query/@Param nên `?benhNhanId=…` bị bỏ qua (QP-06) và không có id trên đường dẫn.
//    Thân POST là `CreateRelativeDto` (chỉ năm trường; `benhNhanId` trong thân là 400).
//  - Không RequireAdminScope, không OriginGuard: xác thực bằng header Authorization (trình duyệt không tự gửi), không cookie nên không có CSRF.
@Controller('patient/relatives')
export class RelativesController {
  constructor(
    @Inject(RelativesService) private readonly service: RelativesService,
  ) {}

  @Get()
  @Roles('BenhNhan')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RelativesListResponse> {
    // Dữ liệu cá nhân: không cho trình duyệt hay proxy lưu lại. Đặt trước khi gọi service để nhánh lỗi cũng có
    res.setHeader('Cache-Control', 'no-store');
    return this.service.list(user.accountId);
  }

  // 201 (mặc định của @Post): thân là hồ sơ ĐỌC LẠI từ DB, không phản chiếu thân gửi lên. Chuyển TƯỜNG MINH năm trường, không truyền nguyên DTO,
  // để thuộc tính thừa (nếu có ai gán sau pipe) không bao giờ tới tầng ghi; `?? null` đổi SĐT thiếu khoá (undefined) thành null.
  @Post()
  @Roles('BenhNhan')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRelativeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RelativeResponse> {
    // Đặt trước khi gọi service để nhánh lỗi (403, 500) cũng có
    res.setHeader('Cache-Control', 'no-store');
    return this.service.create(user.accountId, {
      hoTen: dto.hoTen,
      moiQuanHe: dto.moiQuanHe,
      gioiTinh: dto.gioiTinh,
      ngaySinh: dto.ngaySinh,
      soDienThoai: dto.soDienThoai ?? null,
    });
  }
}
