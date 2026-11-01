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
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import {
  CreateServiceDto,
  ServiceIdDto,
  ServiceListDto,
  UpdateServiceDto,
} from './service.dto.js';
import { ServiceService } from './service.service.js';

@Controller('admin/services')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class ServiceController {
  constructor(
    @Inject(ServiceService) private readonly service: ServiceService,
  ) {}

  @Get()
  list(@AdminScopeCtx() scope: AdminScope, @Query() query: ServiceListDto) {
    return this.service.list(scope, query);
  }

  @Get(':id')
  get(@AdminScopeCtx() scope: AdminScope, @Param() params: ServiceIdDto) {
    return this.service.get(scope, params.id);
  }

  @Post()
  @RequireAdminScope('ToanHeThong')
  create(@AdminScopeCtx() scope: AdminScope, @Body() input: CreateServiceDto) {
    return this.service.create(scope, input);
  }

  @Patch(':id')
  @RequireAdminScope('ToanHeThong')
  update(
    @AdminScopeCtx() scope: AdminScope,
    @Param() params: ServiceIdDto,
    @Body() input: UpdateServiceDto,
  ) {
    return this.service.update(scope, params.id, input);
  }
}
