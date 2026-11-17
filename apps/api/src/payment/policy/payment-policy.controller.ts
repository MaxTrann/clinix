import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Put,
} from '@nestjs/common';
import { ServiceIdDto } from '../../admin/services/service.dto.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import { PaymentPolicyService } from './payment-policy.service.js';
import { UpdatePaymentPolicyDto } from './policy.dto.js';

// `GET /admin/payment-policy/services`, `GET …/services/:id`, `PUT …/services/:id` (payment B10; PLAN 5.11 #14). Controller chỉ nhận/trả; luật ở `PaymentPolicyService`.
//  - `@Roles('QuanTriVien')` + `@RequireAdminScope('ToanHeThong')`: chỉ Quản trị viên toàn hệ thống; chi nhánh, Bệnh nhân, Lễ tân, Bác sĩ 403, chưa đăng nhập 401 (CSD-14, Q10). Service kiểm thêm lần nữa.
//  - Tên tham số đường dẫn là `:id` để TÁI DÙNG `ServiceIdDto` của admin (một luật kiểm id BIGINT), không viết bản thứ hai; plan ghi `:dichVuKhamId` là tên `[đề xuất]`.
//  - `Cache-Control: no-store` GHI TRÊN từng route (cấu hình tài chính; CSD-15); khoá lạ ở thân là 400 `TRUONG_KHONG_DUOC_PHEP` (ValidationPipe toàn cục).
@Controller('admin/payment-policy/services')
@Roles('QuanTriVien')
@RequireAdminScope('ToanHeThong')
export class PaymentPolicyController {
  constructor(
    @Inject(PaymentPolicyService)
    private readonly service: PaymentPolicyService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@AdminScopeCtx() scope: AdminScope) {
    return this.service.list(scope);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@AdminScopeCtx() scope: AdminScope, @Param() params: ServiceIdDto) {
    return this.service.get(scope, params.id);
  }

  @Put(':id')
  @Header('Cache-Control', 'no-store')
  replace(
    @AdminScopeCtx() scope: AdminScope,
    @Param() params: ServiceIdDto,
    @Body() input: UpdatePaymentPolicyDto,
  ) {
    return this.service.replace(scope, params.id, input);
  }
}
