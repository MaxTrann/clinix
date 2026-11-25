import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
// Import GIÁ TRỊ (không `import type`) cho `AdminRescheduleRequestsQueryDto`: ValidationPipe cần metadata của lớp lúc chạy, nếu không query không được kiểm
import {
  AdminRescheduleRequestsQueryDto,
  type RescheduleRequestPage,
} from './reschedule-request-list.dto.js';
import { RescheduleRequestListService } from './reschedule-request-list.service.js';
import type { RescheduleRequestDetail } from './reschedule-request-list.types.js';
// Import GIÁ TRỊ cho hai DTO của B9 (cùng lý do với query DTO ở trên: ValidationPipe cần metadata của lớp lúc chạy)
import {
  ApproveRescheduleRequestDto,
  RejectRescheduleRequestDto,
  type ApproveRescheduleRequestResult,
  type RejectRescheduleRequestResult,
} from './reschedule-request-handle.dto.js';
import { RescheduleRequestApproveService } from './reschedule-request-approve.service.js';
import { RescheduleRequestRejectService } from './reschedule-request-reject.service.js';

// Danh sách và chi tiết YÊU CẦU ĐỔI LỊCH ngoài chính sách của QUẢN TRỊ VIÊN (reschedule B8; PLAN reschedule 5.7, 5.8). Controller chỉ nhận/trả; logic ở `RescheduleRequestListService`. CHỈ ĐỌC.
//  - `@Roles('QuanTriVien')` và `@RequireAdminScope('Any')` GHI TRÊN TỪNG ROUTE (AR-02): Bệnh nhân, Bác sĩ, Lễ tân nhận 403 kể cả khi gửi query sai hay id sai dạng. Cả hai phạm vi (Toàn hệ thống,
//    Chi nhánh) vào được. LƯU Ý: `@RequireAdminScope` cũng trả 403 cho vai trò khác, nên bỏ riêng `@Roles` KHÔNG làm e2e đỏ; AR-02 (`findRouteRoleViolations`) mới là lớp bắt đột biến đó.
//  - Phạm vi chỉ từ `AdminScopeCtx` (guard đọc DB mỗi request); `chiNhanhId` trong query không phải quyền: Quản trị viên Chi nhánh bị ép theo chi nhánh được gán và giá trị gửi lên bị BỎ QUA
//    (nếp `admin/appointments`, DSV-02); chỉ Toàn hệ thống dùng nó làm bộ lọc. Yêu cầu ngoài phạm vi là 404 cùng thân với "không có" và "id sai dạng" (id phân tích ở service, sau phạm vi).
//  - `@Header('Cache-Control', 'no-store')` trên từng route (xem `ReceptionRescheduleRequestsController`). Không OriginGuard: xác thực bằng header Authorization, không cookie nên không có CSRF.
//  - B9 thêm `POST :yeuCauId/approve` và `POST :yeuCauId/reject` vào CHÍNH lớp này; chữ của hai route đọc dưới đây không đổi.
@Controller('admin/reschedule-requests')
export class AdminRescheduleRequestsController {
  constructor(
    @Inject(RescheduleRequestListService)
    private readonly service: RescheduleRequestListService,
    @Inject(RescheduleRequestApproveService)
    private readonly approveService: RescheduleRequestApproveService,
    @Inject(RescheduleRequestRejectService)
    private readonly rejectService: RescheduleRequestRejectService,
  ) {}

  // 200 (mặc định của @Get). Không yêu cầu nào khớp, hoặc trang vượt cuối ⇒ `items: []`, không 404
  @Get()
  @Roles('QuanTriVien')
  @RequireAdminScope('Any')
  @Header('Cache-Control', 'no-store')
  list(
    @AdminScopeCtx() scope: AdminScope,
    @Query() query: AdminRescheduleRequestsQueryDto,
  ): Promise<RescheduleRequestPage> {
    // Chuyển TƯỜNG MINH từng giá trị; `offset` là getter của DTO nên phải lấy ra tại đây
    return this.service.list(scope, {
      trangThai: query.trangThai,
      bacSiId: query.bacSiId,
      q: query.q,
      chiNhanhId: query.chiNhanhId,
      page: query.page,
      pageSize: query.pageSize,
      offset: query.offset,
    });
  }

  @Get(':yeuCauId')
  @Roles('QuanTriVien')
  @RequireAdminScope('Any')
  @Header('Cache-Control', 'no-store')
  detail(
    @AdminScopeCtx() scope: AdminScope,
    @Param('yeuCauId') yeuCauId: string,
  ): Promise<RescheduleRequestDetail> {
    return this.service.detail(scope, yeuCauId);
  }

  // Hai route GHI của B9 (TRACKING reschedule 1.13), cùng nếp `AdminOverrideController` (B14): `@HttpCode(200)` (`@Post` mặc định 201, hợp đồng là 200), `@Roles('QuanTriVien')` và `@RequireAdminScope('Any')` trên TỪNG
  // route (AR-02). Phạm vi chỉ từ `AdminScopeCtx`, người xử lý chỉ từ access token; `:yeuCauId` là chuỗi THÔ. Chuyển TƯỜNG MINH từng trường của thân, không truyền nguyên DTO.
  @Post(':yeuCauId/approve')
  @HttpCode(200)
  @Roles('QuanTriVien')
  @RequireAdminScope('Any')
  @Header('Cache-Control', 'no-store')
  approve(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Param('yeuCauId') yeuCauId: string,
    @Body() body: ApproveRescheduleRequestDto,
  ): Promise<ApproveRescheduleRequestResult> {
    return this.approveService.approveAsAdmin(scope, user.accountId, yeuCauId, {
      ghiChu: body.ghiChu,
      khungGioId: body.khungGioId,
    });
  }

  @Post(':yeuCauId/reject')
  @HttpCode(200)
  @Roles('QuanTriVien')
  @RequireAdminScope('Any')
  @Header('Cache-Control', 'no-store')
  reject(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Param('yeuCauId') yeuCauId: string,
    @Body() body: RejectRescheduleRequestDto,
  ): Promise<RejectRescheduleRequestResult> {
    return this.rejectService.rejectAsAdmin(scope, user.accountId, yeuCauId, {
      ghiChu: body.ghiChu,
    });
  }
}
