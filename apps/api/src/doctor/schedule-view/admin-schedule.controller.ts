import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import {
  AdminDoctorListDto,
  AdminScheduleGridDto,
} from './admin-schedule.dto.js';
import { AdminScheduleService } from './admin-schedule.service.js';

// Chỉ XEM (GET) lịch bác sĩ; phân công/gỡ ca nằm ở ShiftAssignmentController cùng tiền tố.
@Controller('admin/doctor-shifts')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class AdminScheduleController {
  constructor(
    @Inject(AdminScheduleService)
    private readonly service: AdminScheduleService,
  ) {}

  @Get('doctors')
  listDoctors(
    @AdminScopeCtx() scope: AdminScope,
    @Query() query: AdminDoctorListDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.listDoctors(scope, query);
  }

  @Get()
  grid(
    @AdminScopeCtx() scope: AdminScope,
    @Query() query: AdminScheduleGridDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.getGrid(scope, query);
  }
}
