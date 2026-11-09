import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import { ShiftRuleDto } from './shift-assignment.dto.js';
import { ShiftAssignmentService } from './shift-assignment.service.js';

// Phân công ca cho bác sĩ: chỉ Quản trị viên (bác sĩ không có endpoint ghi ca). Gỡ ca (B4) thêm sau.
@Controller('admin/doctor-shifts')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class ShiftAssignmentController {
  constructor(
    @Inject(ShiftAssignmentService)
    private readonly service: ShiftAssignmentService,
  ) {}

  /** Phân công thật: all-or-none; có vi phạm => 409 mang mã của vi phạm đầu tiên và `chiTiet.viPham[]`. */
  @Post()
  assign(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: ShiftRuleDto,
  ) {
    return this.service.assign(scope, user.accountId, input);
  }

  /** Xem trước quy tắc lặp: không ghi, không khoá; vi phạm nằm trong thân 200 (không phải lỗi HTTP). */
  @Post('preview')
  @HttpCode(200)
  preview(@AdminScopeCtx() scope: AdminScope, @Body() input: ShiftRuleDto) {
    return this.service.preview(scope, input);
  }
}
