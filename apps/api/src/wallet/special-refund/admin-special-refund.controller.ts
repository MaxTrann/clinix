import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
// Import GIÁ TRỊ (không `import type`) cho hai DTO: ValidationPipe cần metadata của lớp lúc chạy
import {
  CreateSpecialRefundDto,
  RefundablePaymentsQueryDto,
  type RefundablePayment,
  type SpecialRefundCreated,
} from './special-refund.dto.js';
import { SpecialRefundService } from './special-refund.service.js';

// `GET /admin/wallet/refundable-payments`, `POST /admin/wallet/special-refunds` (payment B13; PLAN 5.6.2, 5.11 #12). Controller chỉ nhận/trả; logic ở `SpecialRefundService`.
//  - `@Roles('QuanTriVien')` và `@RequireAdminScope('ToanHeThong')` trên TỪNG route (Q10, QTT-06, HDB-10): Admin `ChiNhanh`, Bệnh nhân, Lễ tân, Bác sĩ ⇒ 403, khách ⇒ 401. Guard chạy TRƯỚC DTO.
//  - `no-store`. `POST` trả 200 (PLAN 5.11 #12) với `{ maGiaoDich, soTien }`, không số dư (BDT-08). Người hoàn CHỈ từ token. Màn xác nhận là bước ở web: máy chủ chỉ có MỘT lời gọi ghi.
@Controller('admin/wallet')
export class AdminSpecialRefundController {
  constructor(
    @Inject(SpecialRefundService)
    private readonly service: SpecialRefundService,
  ) {}

  @Get('refundable-payments')
  @Roles('QuanTriVien')
  @RequireAdminScope('ToanHeThong')
  @Header('Cache-Control', 'no-store')
  list(
    @Query() query: RefundablePaymentsQueryDto,
  ): Promise<{ items: RefundablePayment[] }> {
    return this.service
      .listRefundable({
        maLichHen: query.maLichHen,
        benhNhanId: query.benhNhanId,
      })
      .then((items) => ({ items }));
  }

  @Post('special-refunds')
  @HttpCode(200)
  @Roles('QuanTriVien')
  @RequireAdminScope('ToanHeThong')
  @Header('Cache-Control', 'no-store')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSpecialRefundDto,
  ): Promise<SpecialRefundCreated> {
    return this.service.create(user.accountId, dto);
  }
}
