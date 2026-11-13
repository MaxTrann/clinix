import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import { ParseAppointmentCodePipe } from '../appointment-code.pipe.js';
// Import GIÁ TRỊ (không `import type`) cho AdminOverrideDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không thân không được kiểm
import {
  AdminOverrideDto,
  type AdminOverrideResult,
} from './admin-override.dto.js';
import { AdminOverrideService } from './admin-override.service.js';

// Route override của QUẢN TRỊ VIÊN (task B14; PLAN booking 5.7, 5.9; TRACKING 3.31 B14-C). Controller chỉ nhận/trả; logic ở AdminOverrideService.
//  - Cùng tiền tố `admin/appointments` với route đọc của B4 sau này; đoạn đuôi `:maLichHen/override-status` khác phương thức và số đoạn nên không đụng `GET :maLichHen`.
//  - `@Roles('QuanTriVien')` và `@RequireAdminScope('Any')` GHI TRÊN route (AR-02, QB-07; bài học ĐA-9b): Bệnh nhân, Bác sĩ, Lễ tân nhận 403 `KHONG_DU_QUYEN` kể cả khi gửi mã sai dạng hay thân sai. Cả hai phạm vi
//    (Toàn hệ thống, Chi nhánh) vào được; lịch ngoài phạm vi của Quản trị viên Chi nhánh là 404 cùng thân với lịch không tồn tại (QB-05).
//  - Phạm vi chỉ từ `AdminScopeCtx` (đọc từ DB mỗi request), người thực hiện chỉ từ access token; khoá lạ trong thân là 400 `TRUONG_KHONG_DUOC_PHEP`.
//  - `@Header('Cache-Control', 'no-store')`: Nest áp header ngay sau guard và TRƯỚC pipe, nên 404 do pipe, 400 do DTO và lỗi nghiệp vụ do dịch vụ ném đều có (QB-08); 401 và 403 do guard thì KHÔNG hứa.
//  - Không OriginGuard: xác thực bằng header Authorization (trình duyệt không tự gửi), không cookie nên không có CSRF.
@Controller('admin/appointments')
export class AdminOverrideController {
  constructor(
    @Inject(AdminOverrideService)
    private readonly service: AdminOverrideService,
  ) {}

  // `@HttpCode(200)`: `@Post` mặc định trả 201, mà hợp đồng là 200 (đổi trạng thái, không tạo gì). Chuyển TƯỜNG MINH từng trường của thân, không truyền nguyên DTO.
  @Post(':maLichHen/override-status')
  @HttpCode(200)
  @Roles('QuanTriVien')
  @RequireAdminScope('Any')
  @Header('Cache-Control', 'no-store')
  override(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
    @Body() body: AdminOverrideDto,
  ): Promise<AdminOverrideResult> {
    return this.service.override(scope, user.accountId, maLichHen, {
      trangThai: body.trangThai,
      lyDo: body.lyDo,
    });
  }
}
