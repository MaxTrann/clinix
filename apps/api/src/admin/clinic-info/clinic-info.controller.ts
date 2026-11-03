import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import { UpdateClinicInfoDto } from './clinic-info.dto.js';
import { ClinicInfoService } from './clinic-info.service.js';

@Controller('admin/clinic-info')
// Figma 629:2: Admin Chi nhánh được xem (chỉ đọc); chỉ Toàn hệ thống được sửa
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class ClinicInfoController {
  constructor(
    @Inject(ClinicInfoService) private readonly clinicInfo: ClinicInfoService,
  ) {}

  @Get()
  get() {
    return this.clinicInfo.get();
  }

  @Put()
  @RequireAdminScope('ToanHeThong')
  update(
    @AdminScopeCtx() scope: AdminScope,
    @Body() input: UpdateClinicInfoDto,
  ) {
    return this.clinicInfo.update(scope, input);
  }
}
