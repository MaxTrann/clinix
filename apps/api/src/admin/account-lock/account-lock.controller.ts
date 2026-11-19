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
import { AccountLockService } from './account-lock.service.js';

// Khoá / mở khoá tài khoản (TK b7). KHÔNG có body (không có ô lý do: audit không có chỗ lưu); dữ liệu gửi thêm bị bỏ qua.
// Ma trận quyền và thứ tự kiểm 4a/4b nằm ở `account-lock.policy.ts` (service gọi), controller chỉ nhận và trả.
// Cùng tiền tố `admin/accounts` với controller đọc của B17 nhưng là controller riêng của module riêng.
@Controller('admin/accounts')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class AccountLockController {
  constructor(
    @Inject(AccountLockService) private readonly locks: AccountLockService,
  ) {}

  @Post(':id/lock')
  @HttpCode(200)
  lock(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: AccountIdDto,
  ) {
    return this.locks.lock(scope, user.accountId, params.id);
  }

  @Post(':id/unlock')
  @HttpCode(200)
  unlock(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: AccountIdDto,
  ) {
    return this.locks.unlock(scope, user.accountId, params.id);
  }
}
