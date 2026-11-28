import { Controller, Get, Header, Inject, Query } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
// Import GIÁ TRỊ (không `import type`): ValidationPipe cần metadata của lớp DTO lúc chạy, nếu không query không được kiểm
import { DashboardFilterDto } from '../filter/dashboard-filter.dto.js';
import type { AdminDashboard } from './admin-dashboard.dto.js';
import { AdminDashboardService } from './admin-dashboard.service.js';

// Tổng quan của QUẢN TRỊ VIÊN (dashboard B1; PLAN dashboard 5.3, 5.7; T2, T9, T12). Controller chỉ nhận và trả; logic ở `AdminDashboardService`.
//  - `@Roles('QuanTriVien')` và `@RequireAdminScope('Any')` ghi trên TỪNG route: Bệnh nhân, Bác sĩ, Lễ tân nhận 403 kể cả khi gửi query sai (guard chạy trước pipe).
//    Phạm vi chỉ lấy từ `AdminScopeCtx` (guard đọc DB mỗi request); `chiNhanhId` của query chỉ là bộ lọc.
//  - `@Header('Cache-Control', 'no-store')`: phản hồi có số liệu vận hành; Nest đặt header trước pipe nên cả 400 của DTO và 404 cũng có (DBL-07).
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(
    @Inject(AdminDashboardService)
    private readonly service: AdminDashboardService,
  ) {}

  @Get()
  @Roles('QuanTriVien')
  @RequireAdminScope('Any')
  @Header('Cache-Control', 'no-store')
  overview(
    @AdminScopeCtx() scope: AdminScope,
    @Query() query: DashboardFilterDto,
  ): Promise<AdminDashboard> {
    return this.service.overview(scope, query);
  }
}
