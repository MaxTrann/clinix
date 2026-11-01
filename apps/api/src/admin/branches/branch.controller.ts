import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import { BranchIdDto, BranchListDto, CreateBranchDto } from './branch.dto.js';
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
}
