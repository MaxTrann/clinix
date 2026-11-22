import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
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
  DoctorIdDto,
  DoctorListDto,
  UpdateDoctorProfileDto,
} from './doctor.dto.js';
import { DoctorUpdateService } from './doctor-update.service.js';
import { DoctorService } from './doctor.service.js';

// Admin B12: cả hai phạm vi được xem; dữ liệu lọc theo phạm vi ở service.
@Controller('admin/doctors')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class DoctorController {
  constructor(
    @Inject(DoctorService) private readonly doctors: DoctorService,
    @Inject(DoctorUpdateService) private readonly updates: DoctorUpdateService,
  ) {}

  @Get()
  list(@AdminScopeCtx() scope: AdminScope, @Query() query: DoctorListDto) {
    return this.doctors.list(scope, query);
  }

  @Get(':id')
  get(@AdminScopeCtx() scope: AdminScope, @Param() params: DoctorIdDto) {
    return this.doctors.get(scope, params.id);
  }

  // Admin B13: cả hai phạm vi; Chi nhánh chỉ sửa bác sĩ của mình và không đổi được chi nhánh (kiểm ở service dưới khoá). Người thực hiện lấy từ phiên.
  @Patch(':id')
  update(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: DoctorIdDto,
    @Body() input: UpdateDoctorProfileDto,
  ) {
    return this.updates.update(scope, user.accountId, params.id, input);
  }
}
