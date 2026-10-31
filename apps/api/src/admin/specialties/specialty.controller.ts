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
  CreateSpecialtyDto,
  UpdateSpecialtyDto,
  SpecialtyStatusDto,
  SpecialtyListDto,
  SpecialtySearchDto,
  SpecialtyIdDto,
} from './specialty.dto.js';
import { SpecialtyService } from './specialty.service.js';

@Controller('admin/specialties')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class SpecialtyController {
  constructor(
    @Inject(SpecialtyService) private readonly service: SpecialtyService,
  ) {}

  @Get()
  list(@AdminScopeCtx() scope: AdminScope, @Query() query: SpecialtyListDto) {
    return this.service.list(scope, query);
  }

  @Get(':id')
  get(@AdminScopeCtx() scope: AdminScope, @Param() params: SpecialtyIdDto) {
    return this.service.get(scope, params.id);
  }

  @Post()
  @RequireAdminScope('ToanHeThong')
  create(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateSpecialtyDto,
  ) {
    return this.service.create(scope, user.accountId, input);
  }

  @Patch(':id')
  @RequireAdminScope('ToanHeThong')
  update(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: SpecialtyIdDto,
    @Body() input: UpdateSpecialtyDto,
  ) {
    return this.service.update(scope, user.accountId, params.id, input);
  }

  @Patch(':id/status')
  @RequireAdminScope('ToanHeThong')
  setStatus(
    @AdminScopeCtx() scope: AdminScope,
    @Param() params: SpecialtyIdDto,
    @Body() input: SpecialtyStatusDto,
  ) {
    return this.service.setStatus(scope, params.id, input);
  }
}

@Controller('admin/options/specialties')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class SpecialtyOptionsController {
  constructor(
    @Inject(SpecialtyService) private readonly service: SpecialtyService,
  ) {}

  @Get()
  list(@AdminScopeCtx() scope: AdminScope, @Query() query: SpecialtySearchDto) {
    return this.service.options(scope, query);
  }
}
