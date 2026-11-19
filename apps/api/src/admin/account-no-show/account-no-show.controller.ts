import { Controller, HttpCode, Inject, Param, Post } from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import { AccountIdDto } from '../accounts/account.dto.js';
import { AccountNoShowService } from './account-no-show.service.js';

// Mở khoá đặt lịch do no-show (TK, PLAN admin 5.6, Q31). Quyền "chỉ Toàn hệ thống" kiểm ở service SAU bước tầm nhìn
// (nên guard dùng 'Any'): Admin Chi nhánh thấy được Bệnh nhân của mình nhận 403, không phải 404.
// KHÔNG có thân (@Body): mọi thân gửi kèm bị bỏ qua, nên không ép được giá trị cờ hay số lần no-show.
@Controller('admin/accounts')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class AccountNoShowController {
  constructor(
    @Inject(AccountNoShowService)
    private readonly noShow: AccountNoShowService,
  ) {}

  @Post(':id/unlock-no-show')
  @HttpCode(200)
  unlock(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: AccountIdDto,
  ) {
    return this.noShow.unlock(scope, user.accountId, params.id);
  }
}
