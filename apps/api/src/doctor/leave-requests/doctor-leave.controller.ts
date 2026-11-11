import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { ParseRecordIdPipe } from '../common/parse-record-id.pipe.js';
import { DoctorLeaveHistoryService } from './doctor-leave-history.service.js';
import { CreateLeaveRequestDto } from './doctor-leave.dto.js';
import { DoctorLeaveService } from './doctor-leave.service.js';
import { LeaveHistoryQueryDto } from './leave-history.dto.js';

// Chỉ Bác sĩ, chỉ cho CHÍNH MÌNH: `bac_si_id` lấy từ token, DTO không có `bacSiId` (gửi lên ⇒ 400 TRUONG_KHONG_DUOC_PHEP).
// Không có route huỷ yêu cầu (Q23): Bác sĩ không tự huỷ, chỉ Admin duyệt/từ chối.
@Controller('doctor/leave-requests')
@Roles('BacSi')
export class DoctorLeaveController {
  constructor(
    @Inject(DoctorLeaveService) private readonly service: DoctorLeaveService,
    @Inject(DoctorLeaveHistoryService)
    private readonly history: DoctorLeaveHistoryService,
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

  // Lịch sử của CHÍNH mình, mới nhất trước (B12, YN-15).
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: LeaveHistoryQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return this.history.list(user.accountId, query);
  }

  // Id sai dạng, không có, của người khác: cùng 404 cùng thân (YN-15).
  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseRecordIdPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return this.history.get(user.accountId, id);
  }
}
