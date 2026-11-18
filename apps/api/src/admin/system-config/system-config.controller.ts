import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import { UpdateSystemConfigDto } from './system-config.dto.js';
import { SystemConfigAdminService } from './system-config-admin.service.js';

// Cấu hình hệ thống chỉ dành cho Quản trị viên Toàn hệ thống, cả đọc lẫn sửa (PLAN admin 5.3, CH A2); Quản trị viên Chi nhánh và vai trò khác nhận 403.
// `GET …/history` (B6) sẽ thêm vào chính controller này.
@Controller('admin/system-config')
@Roles('QuanTriVien')
@RequireAdminScope('ToanHeThong')
export class SystemConfigController {
  constructor(
    @Inject(SystemConfigAdminService)
    private readonly config: SystemConfigAdminService,
  ) {}

  @Get()
  get() {
    return this.config.read();
  }

  // Cập nhật một phần (vắng khoá = không đổi) kèm lý do; chưa có dòng cấu hình thì tạo lần đầu. 200 cả hai trường hợp, trả cấu hình đã lưu.
  @Put()
  update(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateSystemConfigDto,
  ) {
    return this.config.update(scope, user.accountId, input);
  }
}
