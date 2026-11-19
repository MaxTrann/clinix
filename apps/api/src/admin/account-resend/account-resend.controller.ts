import { Controller, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import { AccountIdDto } from '../accounts/account.dto.js';
import { AccountResendService } from './account-resend.service.js';

// Gửi lại liên kết kích hoạt (TK A2, A3; PLAN admin 5.6, Q23). Quyền theo ma trận (Chi nhánh chỉ Bác sĩ, Lễ tân chi nhánh mình) kiểm ở service SAU bước
// tầm nhìn, nên guard dùng 'Any': Admin Chi nhánh thấy được Bệnh nhân của mình nhận 403, không phải 404.
// KHÔNG có thân (@Body): mọi thân gửi kèm bị bỏ qua. Cùng tiền tố `admin/accounts` với controller đọc của B17 nhưng là controller riêng của module riêng.
@Controller('admin/accounts')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class AccountResendController {
  constructor(
    @Inject(AccountResendService)
    private readonly resend: AccountResendService,
  ) {}

  // 200 (không phải 201: không tạo tài nguyên). Gửi thư lỗi cũng là 200 với `guiEmail = ThatBai`.
  @Post(':id/resend-activation')
  @HttpCode(200)
  resendActivation(
    @AdminScopeCtx() scope: AdminScope,
    @Param() params: AccountIdDto,
  ) {
    return this.resend.resend(scope, params.id);
  }
}
