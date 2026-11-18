import { Body, Controller, Get, Inject, Put, Query } from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';
import { UpdateSystemConfigDto } from './system-config.dto.js';
import { SystemConfigAdminService } from './system-config-admin.service.js';
import { SystemConfigHistoryService } from './system-config-history.service.js';

// Cấu hình hệ thống chỉ dành cho Quản trị viên Toàn hệ thống, cả đọc lẫn sửa (PLAN admin 5.3, CH A2); Quản trị viên Chi nhánh và vai trò khác nhận 403.
// `GET …/history` (B6) đọc lịch sử các lần lưu; guard ở cấp lớp áp cho cả ba route.
@Controller('admin/system-config')
@Roles('QuanTriVien')
@RequireAdminScope('ToanHeThong')
export class SystemConfigController {
  constructor(
    @Inject(SystemConfigAdminService)
    private readonly config: SystemConfigAdminService,
    @Inject(SystemConfigHistoryService)
    private readonly historyService: SystemConfigHistoryService,
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

  // Lịch sử các lần lưu cấu hình, mới nhất trước, phân trang offset (Q42). Chưa có lịch sử thì trả danh sách rỗng, không báo lỗi.
  @Get('history')
  history(@AdminScopeCtx() scope: AdminScope, @Query() query: PageQueryDto) {
    return this.historyService.history(scope, query);
  }
}
