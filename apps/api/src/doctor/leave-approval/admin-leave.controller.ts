import { Controller, Get, Inject, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import { ParseRecordIdPipe } from '../common/parse-record-id.pipe.js';
import { AdminLeaveListDto } from './admin-leave.dto.js';
import { AdminLeaveService } from './admin-leave.service.js';

// Quản trị viên xem yêu cầu nghỉ phép của bác sĩ (B13). Toàn hệ thống: mọi chi nhánh; Chi nhánh: chỉ bác sĩ có chi nhánh HIỆN TẠI là chi nhánh mình,
// ngoài phạm vi ⇒ 404 cùng thân (Q28). Từ chối/duyệt thêm ở B14, B15.
@Controller('admin/leave-requests')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class AdminLeaveController {
  constructor(
    @Inject(AdminLeaveService) private readonly service: AdminLeaveService,
  ) {}

  @Get()
  list(
    @AdminScopeCtx() scope: AdminScope,
    @Query() query: AdminLeaveListDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Có lý do nghỉ của bác sĩ: không cho trình duyệt hay proxy lưu lại.
    res.setHeader('Cache-Control', 'no-store');
    return this.service.list(scope, query);
  }

  @Get(':id')
  get(
    @AdminScopeCtx() scope: AdminScope,
    @Param('id', ParseRecordIdPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.get(scope, id);
  }
}
