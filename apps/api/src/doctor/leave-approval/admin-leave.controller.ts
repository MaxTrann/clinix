import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import { ParseRecordIdPipe } from '../common/parse-record-id.pipe.js';
import { AdminLeaveApproveService } from './admin-leave-approve.service.js';
import { RejectLeaveRequestDto } from './admin-leave-reject.dto.js';
import { AdminLeaveRejectService } from './admin-leave-reject.service.js';
import { AdminLeaveListDto } from './admin-leave.dto.js';
import { AdminLeaveService } from './admin-leave.service.js';

// Quản trị viên xem yêu cầu nghỉ phép của bác sĩ (B13). Toàn hệ thống: mọi chi nhánh; Chi nhánh: chỉ bác sĩ có chi nhánh HIỆN TẠI là chi nhánh mình,
// ngoài phạm vi ⇒ 404 cùng thân (Q28). Từ chối (B14), Duyệt (B15).
@Controller('admin/leave-requests')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class AdminLeaveController {
  constructor(
    @Inject(AdminLeaveService) private readonly service: AdminLeaveService,
    @Inject(AdminLeaveRejectService)
    private readonly rejection: AdminLeaveRejectService,
    @Inject(AdminLeaveApproveService)
    private readonly approval: AdminLeaveApproveService,
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

  // Từ chối: 200 (đổi trạng thái của tài nguyên có sẵn, không tạo mới). `actorId` lấy từ phiên, không từ thân yêu cầu.
  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseRecordIdPipe) id: string,
    @Body() body: RejectLeaveRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return this.rejection.reject(scope, user.accountId, id, body.lyDo);
  }

  // Duyệt (B15): 200 kèm kết quả huỷ lịch hẹn bị ảnh hưởng. Không có thân yêu cầu; `actorId` lấy từ phiên.
  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseRecordIdPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return this.approval.approve(scope, user.accountId, id);
  }
}
