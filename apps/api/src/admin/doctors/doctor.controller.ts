import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import { DoctorIdDto, DoctorListDto } from './doctor.dto.js';
import { DoctorService } from './doctor.service.js';

// Admin B12: cả hai phạm vi được xem; dữ liệu lọc theo phạm vi ở service.
@Controller('admin/doctors')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class DoctorController {
  constructor(@Inject(DoctorService) private readonly doctors: DoctorService) {}

  @Get()
  list(@AdminScopeCtx() scope: AdminScope, @Query() query: DoctorListDto) {
    return this.doctors.list(scope, query);
  }

  @Get(':id')
  get(@AdminScopeCtx() scope: AdminScope, @Param() params: DoctorIdDto) {
    return this.doctors.get(scope, params.id);
  }
}
