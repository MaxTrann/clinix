import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { ParseAppointmentCodePipe } from '../../appointments/appointment-code.pipe.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CashPaymentService } from './cash-payment.service.js';
// Import GIÁ TRỊ (không `import type`) cho CollectCashDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không thân không được kiểm
import {
  CollectCashDto,
  type CashPreview,
  type CollectCashResult,
} from './cash.dto.js';

// `POST /reception/appointments/:maLichHen/collect-cash` (payment B6; PLAN 5.7, 5.11 #8) và `GET …/cash-preview` (payment F4; PLAN 5.11 #8a). Controller chỉ nhận/trả; logic ở `CashPaymentService`.
//  - Cùng tiền tố `reception/appointments` với booking; đoạn `:maLichHen/collect-cash` không đụng route nào của booking.
//  - `@Roles('LeTan')` GHI TRÊN route (QTT-01, TTQ-12): Bệnh nhân, Bác sĩ, Quản trị viên 403; guard chạy TRƯỚC pipe nên người sai vai trò gửi mã sai dạng vẫn nhận 403.
//  - Người thu và chi nhánh CHỈ lấy từ access token (QTT-14); mã sai dạng ⇒ 404 cùng thân (`ParseAppointmentCodePipe`).
//  - `@HttpCode(200)`: hợp đồng là 200 (tiếp đón lịch đã có, không tạo tài nguyên mới cho người gọi). `Cache-Control: no-store`: phiếu thu là dữ liệu tài chính.
@Controller('reception/appointments')
export class CashPaymentController {
  constructor(
    @Inject(CashPaymentService) private readonly service: CashPaymentService,
  ) {}

  // Ba số của hộp "Thu tiền & tiếp đón" (payment F4): chỉ đọc; cùng vai trò, cùng 404 và `no-store` như route ghi
  @Get(':maLichHen/cash-preview')
  @Roles('LeTan')
  @Header('Cache-Control', 'no-store')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
  ): Promise<CashPreview> {
    return this.service.preview(user.accountId, maLichHen);
  }

  @Post(':maLichHen/collect-cash')
  @HttpCode(200)
  @Roles('LeTan')
  @Header('Cache-Control', 'no-store')
  collect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
    @Body() body: CollectCashDto,
  ): Promise<CollectCashResult> {
    return this.service.collect(user.accountId, maLichHen, body.soTien);
  }
}
