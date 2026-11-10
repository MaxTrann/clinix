import {
  Body,
  Controller,
  Delete,
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
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import { ParseRecordIdPipe } from '../common/parse-record-id.pipe.js';
import { ShiftRemovalService } from './shift-removal.service.js';
import { ShiftRuleDto } from './shift-assignment.dto.js';
import { ShiftAssignmentService } from './shift-assignment.service.js';

// Phân công ca cho bác sĩ: chỉ Quản trị viên (bác sĩ không có endpoint ghi ca). Gỡ ca (B4): DELETE theo mã ca.
@Controller('admin/doctor-shifts')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class ShiftAssignmentController {
  constructor(
    @Inject(ShiftAssignmentService)
    private readonly service: ShiftAssignmentService,
    @Inject(ShiftRemovalService)
    private readonly removal: ShiftRemovalService,
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

  /** Gỡ một ca và mọi khung giờ của nó (Q8). Ngoài phạm vi, không có hoặc id sai dạng ⇒ 404 cùng thân; ca đã qua / đã có lịch hẹn ⇒ 409. */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseRecordIdPipe) id: string,
  ): Promise<void> {
    return this.removal.remove(scope, user.accountId, id);
  }
}
