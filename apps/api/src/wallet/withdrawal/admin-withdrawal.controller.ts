import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { ParseRecordIdPipe } from '../../doctor/common/parse-record-id.pipe.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
// Import GIÁ TRỊ (không `import type`) cho hai DTO: ValidationPipe cần metadata của lớp lúc chạy
import {
  AdminWithdrawalsQueryDto,
  WithdrawalDecisionDto,
  type AdminWithdrawalDetail,
  type AdminWithdrawalsPage,
  type WithdrawalDecided,
} from './admin-withdrawal.dto.js';
import { AdminWithdrawalService } from './admin-withdrawal.service.js';

// `GET /admin/wallet/withdrawals`, `GET …/:maYeuCau`, `POST …/:maYeuCau/approve|reject` (payment B12; PLAN 5.8, 5.11 #10, #11). Controller chỉ nhận/trả; logic ở `AdminWithdrawalService`.
//  - `@Roles('QuanTriVien')` và `@RequireAdminScope('ToanHeThong')` trên TỪNG route (Q10, QTT-06, XRT-08): Admin `ChiNhanh`, Bệnh nhân, Lễ tân, Bác sĩ ⇒ 403, khách ⇒ 401. Guard chạy TRƯỚC pipe và DTO.
//  - `no-store` (số tiền và tên Bệnh nhân). Id sai dạng ⇒ 404 `KHONG_TIM_THAY` cùng thân với "không có" (`ParseRecordIdPipe`).
//  - POST trả 200 (đổi trạng thái của tài nguyên có sẵn). Người xử lý CHỈ từ token; thân chỉ có `ghiChu`, khoá lạ ⇒ 400 `TRUONG_KHONG_DUOC_PHEP`.
@Controller('admin/wallet/withdrawals')
export class AdminWithdrawalController {
  constructor(
    @Inject(AdminWithdrawalService)
    private readonly service: AdminWithdrawalService,
  ) {}

  @Get()
  @Roles('QuanTriVien')
  @RequireAdminScope('ToanHeThong')
  @Header('Cache-Control', 'no-store')
  list(
    @Query() query: AdminWithdrawalsQueryDto,
  ): Promise<AdminWithdrawalsPage> {
    // Chuyển TƯỜNG MINH: `offset` là getter của DTO nên mất khi chuyển đối tượng thường
    return this.service.list({
      trangThai: query.trangThai,
      trang: query.trang,
      kichThuoc: query.kichThuoc,
      offset: query.offset,
    });
  }

  @Get(':maYeuCau')
  @Roles('QuanTriVien')
  @RequireAdminScope('ToanHeThong')
  @Header('Cache-Control', 'no-store')
  detail(
    @Param('maYeuCau', ParseRecordIdPipe) maYeuCau: string,
  ): Promise<AdminWithdrawalDetail> {
    return this.service.detail(maYeuCau);
  }

  @Post(':maYeuCau/approve')
  @HttpCode(200)
  @Roles('QuanTriVien')
  @RequireAdminScope('ToanHeThong')
  @Header('Cache-Control', 'no-store')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maYeuCau', ParseRecordIdPipe) maYeuCau: string,
    @Body() dto: WithdrawalDecisionDto,
  ): Promise<WithdrawalDecided> {
    return this.service.approve(user.accountId, maYeuCau, dto.ghiChu);
  }

  @Post(':maYeuCau/reject')
  @HttpCode(200)
  @Roles('QuanTriVien')
  @RequireAdminScope('ToanHeThong')
  @Header('Cache-Control', 'no-store')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maYeuCau', ParseRecordIdPipe) maYeuCau: string,
    @Body() dto: WithdrawalDecisionDto,
  ): Promise<WithdrawalDecided> {
    return this.service.reject(user.accountId, maYeuCau, dto.ghiChu);
  }
}
