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
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
// Import GIÁ TRỊ (không `import type`) cho hai DTO: ValidationPipe cần metadata của lớp lúc chạy, nếu không thân không được kiểm
import {
  CreditUnpostedTopupDto,
  MarkUnprocessableDto,
  type UnpostedTopup,
  type UnpostedTopupDetail,
  type UnpostedTopupHandled,
} from './admin-unposted-topup.dto.js';
import { AdminUnpostedTopupService } from './admin-unposted-topup.service.js';

// Bốn route "Nạp ví chưa cộng" của Quản trị viên (payment B15; PLAN 5.4 bước 6, 5.11 #13; Figma `551:2`). Controller chỉ nhận/trả; logic ở `AdminUnpostedTopupService`.
//  - `@Roles('QuanTriVien')` và `@RequireAdminScope('ToanHeThong')` trên TỪNG route (NVC-09, QTT-01): Admin `ChiNhanh`, Bệnh nhân, Lễ tân, Bác sĩ ⇒ 403, khách ⇒ 401. Guard chạy TRƯỚC DTO.
//  - Người xử lý CHỈ từ token. `no-store`. Hai route ghi trả 200 `{ maGiaoDich, trangThaiDoiSoat }`.
@Controller('admin/payment/unposted-topups')
export class AdminUnpostedTopupController {
  constructor(
    @Inject(AdminUnpostedTopupService)
    private readonly service: AdminUnpostedTopupService,
  ) {}

  @Get()
  @Roles('QuanTriVien')
  @RequireAdminScope('ToanHeThong')
  @Header('Cache-Control', 'no-store')
  list(): Promise<{ items: UnpostedTopup[] }> {
    return this.service.list();
  }

  @Get(':maGiaoDich')
  @Roles('QuanTriVien')
  @RequireAdminScope('ToanHeThong')
  @Header('Cache-Control', 'no-store')
  detail(
    @Param('maGiaoDich') maGiaoDich: string,
  ): Promise<UnpostedTopupDetail> {
    return this.service.detail(maGiaoDich);
  }

  // Thân `CreditUnpostedTopupDto` chỉ để từ chối mọi khoá gửi lên (số tiền chỉ lấy từ giao dịch)
  @Post(':maGiaoDich/credit')
  @HttpCode(200)
  @Roles('QuanTriVien')
  @RequireAdminScope('ToanHeThong')
  @Header('Cache-Control', 'no-store')
  credit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maGiaoDich') maGiaoDich: string,
    @Body() _body: CreditUnpostedTopupDto,
  ): Promise<UnpostedTopupHandled> {
    return this.service.credit(user.accountId, maGiaoDich);
  }

  @Post(':maGiaoDich/mark-unprocessable')
  @HttpCode(200)
  @Roles('QuanTriVien')
  @RequireAdminScope('ToanHeThong')
  @Header('Cache-Control', 'no-store')
  markUnprocessable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maGiaoDich') maGiaoDich: string,
    @Body() dto: MarkUnprocessableDto,
  ): Promise<UnpostedTopupHandled> {
    return this.service.markUnprocessable(user.accountId, maGiaoDich, dto.lyDo);
  }
}
