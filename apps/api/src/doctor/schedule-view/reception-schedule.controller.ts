import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { DoctorSearchQueryDto } from './doctor-list-query.dto.js';
import { ReceptionScheduleGridDto } from './reception-schedule.dto.js';
import { ReceptionScheduleService } from './reception-schedule.service.js';

// Chỉ Lễ tân, chỉ XEM (GET): không có route ghi nên gọi POST/PUT/DELETE là 404 (XL-13). Phạm vi chi nhánh do service đọc từ DB.
@Controller('reception/doctor-schedules')
@Roles('LeTan')
export class ReceptionScheduleController {
  constructor(
    @Inject(ReceptionScheduleService)
    private readonly service: ReceptionScheduleService,
  ) {}

  @Get('doctors')
  listDoctors(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DoctorSearchQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.listDoctors(user.accountId, query);
  }

  @Get()
  grid(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReceptionScheduleGridDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.getGrid(user.accountId, query);
  }
}
