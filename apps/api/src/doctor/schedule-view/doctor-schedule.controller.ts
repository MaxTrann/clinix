import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { ScheduleQueryDto } from './schedule-view.dto.js';
import { ScheduleViewService } from './schedule-view.service.js';

// Chỉ Bác sĩ, chỉ lịch CỦA MÌNH: `bac_si_id` lấy từ token, không nhận từ query (`bacSiId` gửi lên ⇒ 400 TRUONG_KHONG_DUOC_PHEP).
@Controller('doctor/schedule')
@Roles('BacSi')
export class DoctorScheduleController {
  constructor(
    @Inject(ScheduleViewService) private readonly service: ScheduleViewService,
  ) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ScheduleQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Dữ liệu cá nhân của một người: không cho trình duyệt hay proxy lưu lại (XL-16).
    res.setHeader('Cache-Control', 'no-store');
    return this.service.getSchedule(user.accountId, query);
  }
}
