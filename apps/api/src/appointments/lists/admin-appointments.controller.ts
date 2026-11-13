import { Controller, Get, Header, Inject, Param, Query } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import { ParseAppointmentCodePipe } from '../appointment-code.pipe.js';
import type { AdminAppointmentDetail } from './admin-appointments.dto.js';
import { AdminAppointmentsService } from './admin-appointments.service.js';
// Import GIÁ TRỊ (không `import type`) cho OperationsAppointmentsQueryDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không query không được kiểm
import {
  OperationsAppointmentsQueryDto,
  type OperationsAppointmentsPage,
} from './operations-appointments.dto.js';

// Danh sách và chi tiết lịch hẹn của QUẢN TRỊ VIÊN (task B4; PLAN booking 5.9, Q32; TRACKING 3.33 B4-C). Controller chỉ nhận/trả; logic ở AdminAppointmentsService.
//  - `@Roles('QuanTriVien')` và `@RequireAdminScope('Any')` GHI TRÊN TỪNG ROUTE (AR-02, QB-07; bài học ĐA-9b): Bệnh nhân, Bác sĩ, Lễ tân nhận 403 `KHONG_DU_QUYEN` kể cả khi gửi query sai hay mã sai dạng
//    (guard chạy TRƯỚC pipe). Cả hai phạm vi (Toàn hệ thống, Chi nhánh) vào được; lịch ngoài phạm vi của Quản trị viên Chi nhánh là 404 cùng thân với lịch không tồn tại (QB-05). LƯU Ý: `@RequireAdminScope`
//    cũng trả 403 cho vai trò khác, nên bỏ riêng `@Roles` KHÔNG làm e2e đỏ; AR-02 (`architecture.spec.ts`) mới là lớp bắt đột biến đó.
//  - Phạm vi chỉ từ `AdminScopeCtx` (guard đọc DB mỗi request); `chiNhanhId` trong query không phải quyền (Quản trị viên Chi nhánh bị ép theo chi nhánh được gán, DSV-02).
//  - Cùng tiền tố `admin/appointments` với `AdminOverrideController` (B14) nhưng khác phương thức và số đoạn nên không đụng nhau.
//  - `@Header('Cache-Control', 'no-store')` (không `res.setHeader` trong handler): Nest áp header ngay sau guard và TRƯỚC pipe, nên cả 404 do pipe lẫn 400 do DTO cũng có (QB-08); 401 và 403 do guard thì KHÔNG hứa.
//  - Không OriginGuard: xác thực bằng header Authorization (trình duyệt không tự gửi), không cookie nên không có CSRF.
@Controller('admin/appointments')
export class AdminAppointmentsController {
  constructor(
    @Inject(AdminAppointmentsService)
    private readonly service: AdminAppointmentsService,
  ) {}

  // 200 (mặc định của @Get). Không lịch nào khớp, hoặc trang vượt cuối ⇒ `items: []`, không 404 (A1). DTO đi nguyên vào service (kiểu `OperationsAppointmentsQuery`; `offset` là getter nên không trải đối tượng).
  @Get()
  @Roles('QuanTriVien')
  @RequireAdminScope('Any')
  @Header('Cache-Control', 'no-store')
  list(
    @AdminScopeCtx() scope: AdminScope,
    @Query() query: OperationsAppointmentsQueryDto,
  ): Promise<OperationsAppointmentsPage> {
    return this.service.list(scope, query);
  }

  // Chi tiết MỘT lịch. 200, hoặc 404 `KHONG_TIM_THAY` cùng thân cho mọi lý do không xem được (sai dạng do pipe; ngoài phạm vi, không tồn tại do service).
  @Get(':maLichHen')
  @Roles('QuanTriVien')
  @RequireAdminScope('Any')
  @Header('Cache-Control', 'no-store')
  detail(
    @AdminScopeCtx() scope: AdminScope,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
  ): Promise<AdminAppointmentDetail> {
    return this.service.detail(scope, maLichHen);
  }
}
