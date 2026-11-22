import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import {
  ApproveBranchChangeRequestDto,
  BranchChangeRequestIdDto,
  BranchChangeRequestListDto,
  RejectBranchChangeRequestDto,
} from './branch-change-request.dto.js';
import { BranchChangeRequestService } from './branch-change-request.service.js';

// Admin B9, B10: cả hai phạm vi được xem (lọc theo phạm vi ở service); chỉ Toàn hệ thống từ chối và duyệt. Người duyệt lấy từ phiên, không từ body.
@Controller('admin/branch-change-requests')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class BranchChangeRequestController {
  constructor(
    @Inject(BranchChangeRequestService)
    private readonly requests: BranchChangeRequestService,
  ) {}

  @Get()
  list(
    @AdminScopeCtx() scope: AdminScope,
    @Query() query: BranchChangeRequestListDto,
  ) {
    return this.requests.list(scope, query);
  }

  @Get(':id')
  get(
    @AdminScopeCtx() scope: AdminScope,
    @Param() params: BranchChangeRequestIdDto,
  ) {
    return this.requests.get(scope, params.id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequireAdminScope('ToanHeThong')
  reject(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: BranchChangeRequestIdDto,
    @Body() input: RejectBranchChangeRequestDto,
  ) {
    return this.requests.reject(scope, user.accountId, params.id, input.lyDo);
  }

  // Admin B10: chỉ Toàn hệ thống duyệt; người duyệt lấy từ phiên
  @Post(':id/approve')
  @HttpCode(200)
  @RequireAdminScope('ToanHeThong')
  approve(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: BranchChangeRequestIdDto,
    @Body() input: ApproveBranchChangeRequestDto,
  ) {
    return this.requests.approve(
      scope,
      user.accountId,
      params.id,
      input.hieuLucTu,
    );
  }
}
