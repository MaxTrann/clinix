import { Body, Controller, Header, Inject, Post } from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
// Import GIÁ TRỊ (không `import type`) cho CreateWithdrawalDto: ValidationPipe cần metadata của lớp lúc chạy
import {
  CreateWithdrawalDto,
  type WithdrawalCreated,
} from './withdrawal.dto.js';
import { WithdrawalService } from './withdrawal.service.js';

// `POST /patient/wallet/withdrawals` (payment B11; PLAN 5.8, 5.11 #9). Controller chỉ nhận/trả; logic ở `WithdrawalService`.
//  - `@Roles('BenhNhan')` trên route (QTT-01, RTV-07): vai trò khác 403. Chủ ví CHỈ lấy từ token; thân chỉ có `soTien`.
//  - 201 (tạo yêu cầu mới), `Cache-Control: no-store` (giao dịch tài chính cá nhân).
@Controller('patient/wallet/withdrawals')
export class PatientWithdrawalController {
  constructor(
    @Inject(WithdrawalService) private readonly service: WithdrawalService,
  ) {}

  @Post()
  @Roles('BenhNhan')
  @Header('Cache-Control', 'no-store')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWithdrawalDto,
  ): Promise<WithdrawalCreated> {
    return this.service.request(user.accountId, dto);
  }
}
