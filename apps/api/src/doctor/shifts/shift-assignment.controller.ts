import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import { ShiftRuleDto } from './shift-assignment.dto.js';
import { ShiftAssignmentService } from './shift-assignment.service.js';

// Phân công ca cho bác sĩ: chỉ Quản trị viên (bác sĩ không có endpoint ghi ca). Ghi (B3) và gỡ ca (B4) thêm sau.
@Controller('admin/doctor-shifts')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class ShiftAssignmentController {
  constructor(
    @Inject(ShiftAssignmentService)
    private readonly service: ShiftAssignmentService,
  ) {}

  /** Xem trước quy tắc lặp: không ghi, không khoá; vi phạm nằm trong thân 200 (không phải lỗi HTTP). */
  @Post('preview')
  @HttpCode(200)
  preview(@AdminScopeCtx() scope: AdminScope, @Body() input: ShiftRuleDto) {
    return this.service.preview(scope, input);
  }
}
