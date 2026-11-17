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
import { DepositPaymentService } from './deposit-payment.service.js';
// Import GIÁ TRỊ (không `import type`) cho PayDepositDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không thân không được kiểm
import {
  PayDepositDto,
  type DepositPaymentResult,
  type DepositPreview,
} from './deposit.dto.js';

// Hai route thanh toán cọc bằng ví (payment B5; PLAN 5.5, 5.11 #6, #7). Controller chỉ nhận/trả; logic ở `DepositPaymentService`.
//  - Cùng tiền tố `patient/appointments` với booking; hai đoạn `:maLichHen/payment-preview` và `:maLichHen/payment` nhiều hơn một đoạn nên không đụng `GET :maLichHen`.
//  - `@Roles('BenhNhan')` GHI TRÊN từng route (QTT-01, TLK-14): vai trò khác nhận 403, guard chạy TRƯỚC pipe nên người sai vai trò gửi mã sai dạng vẫn nhận 403.
//  - Chủ lịch CHỈ lấy từ access token; thân phải RỖNG (`PayDepositDto`): `benhNhanId`, `viNoiBoId`, `soTien`, khoá lạ nào cũng là 400 `TRUONG_KHONG_DUOC_PHEP` (QTT-03, TLK-15).
//  - `Cache-Control: no-store` áp SAU guard và TRƯỚC pipe nên 404 do mã sai dạng và 400 do thân cũng có (QTT-12).
@Controller('patient/appointments')
export class DepositPaymentController {
  constructor(
    @Inject(DepositPaymentService)
    private readonly service: DepositPaymentService,
  ) {}

  @Get(':maLichHen/payment-preview')
  @Roles('BenhNhan')
  @Header('Cache-Control', 'no-store')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
  ): Promise<DepositPreview> {
    return this.service.preview(user.accountId, maLichHen);
  }

  // `@HttpCode(200)`: `@Post` mặc định trả 201, mà hợp đồng là 200 (xác nhận lịch, không tạo tài nguyên mới). Thân `PayDepositDto` chỉ để từ chối mọi khoá gửi lên.
  @Post(':maLichHen/payment')
  @HttpCode(200)
  @Roles('BenhNhan')
  @Header('Cache-Control', 'no-store')
  pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
    @Body() _body: PayDepositDto,
  ): Promise<DepositPaymentResult> {
    return this.service.pay(user.accountId, maLichHen);
  }
}
