import { Body, Controller, Inject, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CreateLeaveRequestDto } from './doctor-leave.dto.js';
import { DoctorLeaveService } from './doctor-leave.service.js';

// Chỉ Bác sĩ, chỉ cho CHÍNH MÌNH: `bac_si_id` lấy từ token, DTO không có `bacSiId` (gửi lên ⇒ 400 TRUONG_KHONG_DUOC_PHEP).
// Không có route huỷ yêu cầu (Q23): Bác sĩ không tự huỷ, chỉ Admin duyệt/từ chối.
@Controller('doctor/leave-requests')
@Roles('BacSi')
export class DoctorLeaveController {
  constructor(
    @Inject(DoctorLeaveService) private readonly service: DoctorLeaveService,
  ) {}

  // POST mặc định trả 201 (PLAN 5.7 bước 4).
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateLeaveRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Dữ liệu cá nhân (có lý do nghỉ): không cho trình duyệt hay proxy lưu lại.
    res.setHeader('Cache-Control', 'no-store');
    return this.service.create(user.accountId, body);
  }
}
