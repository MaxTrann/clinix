import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import {
  CreateServiceGroupDto,
  UpdateServiceGroupDto,
  ServiceGroupIdDto,
  ServiceGroupListDto,
} from './service-group.dto.js';
import { ServiceGroupService } from './service-group.service.js';

@Controller('admin/service-groups')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class ServiceGroupController {
  constructor(
    @Inject(ServiceGroupService) private readonly service: ServiceGroupService,
  ) {}
  @Get()
  list(
    @AdminScopeCtx() scope: AdminScope,
    @Query() query: ServiceGroupListDto,
  ) {
    return this.service.list(scope, query);
  }
  @Post()
  @RequireAdminScope('ToanHeThong')
  create(
    @AdminScopeCtx() scope: AdminScope,
    @Body() input: CreateServiceGroupDto,
  ) {
    return this.service.create(scope, input);
  }
  @Patch(':id')
  @RequireAdminScope('ToanHeThong')
  update(
    @AdminScopeCtx() scope: AdminScope,
    @Param() params: ServiceGroupIdDto,
    @Body() input: UpdateServiceGroupDto,
  ) {
    return this.service.update(scope, params.id, input);
  }
  @Delete(':id')
  @HttpCode(204)
  @RequireAdminScope('ToanHeThong')
  remove(
    @AdminScopeCtx() scope: AdminScope,
    @Param() params: ServiceGroupIdDto,
  ) {
    return this.service.remove(scope, params.id);
  }
}
