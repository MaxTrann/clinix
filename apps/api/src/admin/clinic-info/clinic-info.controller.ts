import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import { UpdateClinicInfoDto } from './clinic-info.dto.js';
import { ClinicInfoService } from './clinic-info.service.js';

@Controller('admin/clinic-info')
@Roles('QuanTriVien')
@RequireAdminScope('ToanHeThong')
export class ClinicInfoController {
  constructor(
    @Inject(ClinicInfoService) private readonly clinicInfo: ClinicInfoService,
  ) {}

  @Get()
  get(@AdminScopeCtx() scope: AdminScope) {
    return this.clinicInfo.get(scope);
  }

  @Put()
  update(
    @AdminScopeCtx() scope: AdminScope,
    @Body() input: UpdateClinicInfoDto,
  ) {
    return this.clinicInfo.update(scope, input);
  }
}
