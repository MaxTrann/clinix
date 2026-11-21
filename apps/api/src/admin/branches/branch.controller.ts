import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
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
  BranchIdDto,
  BranchListDto,
  CreateBranchDto,
  UpdateBranchDto,
} from './branch.dto.js';
import { BranchService } from './branch.service.js';

@Controller('admin/branches')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class BranchController {
  constructor(
    @Inject(BranchService) private readonly branches: BranchService,
  ) {}

  @Get()
  list(@AdminScopeCtx() scope: AdminScope, @Query() query: BranchListDto) {
    return this.branches.list(scope, query);
  }

  @Get(':id')
  get(@AdminScopeCtx() scope: AdminScope, @Param() params: BranchIdDto) {
    return this.branches.get(scope, params.id);
  }

  @Post()
  @RequireAdminScope('ToanHeThong')
  create(@AdminScopeCtx() scope: AdminScope, @Body() input: CreateBranchDto) {
    return this.branches.create(scope, input);
  }

  // Admin B8: cả hai phạm vi; Chi nhánh chỉ sửa chi nhánh mình (kiểm ở service dưới khoá). Người đề xuất lấy từ phiên, không từ body.
  @Patch(':id')
  update(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: BranchIdDto,
    @Body() input: UpdateBranchDto,
  ) {
    return this.branches.update(scope, user.accountId, params.id, input);
  }
}
