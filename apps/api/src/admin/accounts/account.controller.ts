import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import { AccountIdDto, AccountListDto } from './account.dto.js';
import { AccountService } from './account.service.js';

// Danh sách và chi tiết tài khoản (TK b1–b2). Chỉ ĐỌC: khoá, mở khoá, mở khoá no-show, gửi lại liên kết là việc của B18, B19, B20.
@Controller('admin/accounts')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class AccountController {
  constructor(
    @Inject(AccountService) private readonly accounts: AccountService,
  ) {}

  @Get()
  list(@AdminScopeCtx() scope: AdminScope, @Query() query: AccountListDto) {
    return this.accounts.list(scope, query);
  }

  @Get(':id')
  get(@AdminScopeCtx() scope: AdminScope, @Param() params: AccountIdDto) {
    return this.accounts.get(scope, params.id);
  }
}
