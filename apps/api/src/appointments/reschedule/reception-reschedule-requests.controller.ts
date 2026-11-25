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
// Import GIÁ TRỊ (không `import type`) cho `ReceptionRescheduleRequestsQueryDto`: ValidationPipe cần metadata của lớp lúc chạy, nếu không query không được kiểm
import {
  ReceptionRescheduleRequestsQueryDto,
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

// Danh sách và chi tiết YÊU CẦU ĐỔI LỊCH ngoài chính sách của LỄ TÂN (reschedule B8; PLAN reschedule 5.7, 5.8). Controller chỉ nhận/trả; logic ở `RescheduleRequestListService`. CHỈ ĐỌC.
//  - `@Roles('LeTan')` DUY NHẤT, ghi trên từng route (AR-02): Bệnh nhân, Bác sĩ, Quản trị viên nhận 403 kể cả khi gửi query sai hay id sai dạng (guard chạy TRƯỚC pipe).
//  - Chi nhánh KHÔNG có đường nào từ client: service đọc `le_tan.chi_nhanh_id` ở DB mỗi request; `chiNhanhId` trong query là khoá lạ (400). `:yeuCauId` là chuỗi THÔ (không pipe): service giải phạm vi
//    TRƯỚC rồi mới phân tích id, nên Lễ tân bị khoá nhận 403 chứ không 404 (QDL-02). Id sai dạng, không có, ngoài chi nhánh: cùng một 404 `KHONG_TIM_THAY`.
//  - `@Header('Cache-Control', 'no-store')` (không `res.setHeader` trong handler): Nest áp header ngay sau guard và TRƯỚC pipe, nên cả 400 do DTO cũng có; 401 và 403 do guard thì KHÔNG hứa.
//  - B9 thêm `POST :yeuCauId/approve` và `POST :yeuCauId/reject` vào CHÍNH lớp này (tham số constructor, import và hai phương thức); chữ của hai route đọc dưới đây không đổi.
@Controller('reception/reschedule-requests')
export class ReceptionRescheduleRequestsController {
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
  @Roles('LeTan')
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReceptionRescheduleRequestsQueryDto,
  ): Promise<RescheduleRequestPage> {
    // Chuyển TƯỜNG MINH từng giá trị; `offset` là getter của DTO nên phải lấy ra tại đây
    return this.service.listForReception(user.accountId, {
      trangThai: query.trangThai,
      bacSiId: query.bacSiId,
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
      offset: query.offset,
    });
  }

  @Get(':yeuCauId')
  @Roles('LeTan')
  @Header('Cache-Control', 'no-store')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('yeuCauId') yeuCauId: string,
  ): Promise<RescheduleRequestDetail> {
    return this.service.detailForReception(user.accountId, yeuCauId);
  }

  // Hai route GHI của B9 (TRACKING reschedule 1.13). `@HttpCode(200)`: `@Post` mặc định trả 201, mà hợp đồng là 200 (xử lý một yêu cầu có sẵn; lịch mới của duyệt nằm TRONG thân). `@Roles('LeTan')` trên TỪNG route
  // (AR-02). `:yeuCauId` là chuỗi THÔ (service giải phạm vi rồi mới phân tích id). Chuyển TƯỜNG MINH từng trường của thân, không truyền nguyên DTO.
  @Post(':yeuCauId/approve')
  @HttpCode(200)
  @Roles('LeTan')
  @Header('Cache-Control', 'no-store')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('yeuCauId') yeuCauId: string,
    @Body() body: ApproveRescheduleRequestDto,
  ): Promise<ApproveRescheduleRequestResult> {
    return this.approveService.approveAsReception(user.accountId, yeuCauId, {
      ghiChu: body.ghiChu,
      khungGioId: body.khungGioId,
    });
  }

  @Post(':yeuCauId/reject')
  @HttpCode(200)
  @Roles('LeTan')
  @Header('Cache-Control', 'no-store')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('yeuCauId') yeuCauId: string,
    @Body() body: RejectRescheduleRequestDto,
  ): Promise<RejectRescheduleRequestResult> {
    return this.rejectService.rejectAsReception(user.accountId, yeuCauId, {
      ghiChu: body.ghiChu,
    });
  }
}
