import { Body, Controller, Inject, Post } from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import {
  CreateStaffAccountDto,
  toStaffAccountInput,
} from './staff-account.dto.js';
import { StaffAccountService } from './staff-account.service.js';

// Tạo tài khoản nhân sự (NS b1–b7, A1–A4). Cả hai phạm vi Quản trị viên được gọi; quyền theo vai trò được tạo và chi nhánh kiểm ở service (NS A2, A3, Q40).
// Gửi lại liên kết, khoá, mở khoá là việc của B20, B18; danh sách và chi tiết là của B17.
@Controller('admin/staff-accounts')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class StaffAccountController {
  constructor(
    @Inject(StaffAccountService) private readonly accounts: StaffAccountService,
  ) {}

  // 201 (mặc định của POST). Người thực hiện lấy từ PHIÊN, không từ thân yêu cầu.
  @Post()
  create(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateStaffAccountDto,
  ) {
    return this.accounts.create(
      scope,
      user.accountId,
      toStaffAccountInput(body),
    );
  }
}
