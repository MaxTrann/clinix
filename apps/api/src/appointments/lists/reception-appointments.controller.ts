import { Controller, Get, Header, Inject, Param, Query } from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { ParseAppointmentCodePipe } from '../appointment-code.pipe.js';
// Import GIÁ TRỊ (không `import type`) cho OperationsAppointmentsQueryDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không query không được kiểm
import {
  OperationsAppointmentsQueryDto,
  type OperationsAppointmentsPage,
  type ReceptionAppointmentDetail,
} from './operations-appointments.dto.js';
import { ReceptionAppointmentsService } from './reception-appointments.service.js';

// Danh sách và chi tiết lịch hẹn của LỄ TÂN (task B3; PLAN booking 5.9, Q32, Q34; TRACKING 3.17 B3-C). Controller chỉ nhận/trả; logic ở ReceptionAppointmentsService.
//  - `@Roles('LeTan')` DUY NHẤT, ghi trên từng route (AR-02, QB-07): Bệnh nhân, Bác sĩ, Quản trị viên (cả hai phạm vi) nhận 403. Guard chạy TRƯỚC pipe nên người sai vai trò gửi query hay
//    mã sai vẫn nhận 403, không phải 400 hay 404.
//  - Chi nhánh KHÔNG có đường nào từ client: service đọc `le_tan.chi_nhanh_id` ở DB mỗi request. `chiNhanhId` trong query (nếu đúng dạng) bị bỏ qua (DSV-01).
//  - `@Header('Cache-Control', 'no-store')` (không `res.setHeader` trong handler): Nest áp header ngay sau guard và TRƯỚC pipe, nên cả 404 do pipe lẫn lỗi sinh trong handler cũng có (QB-08).
//  - Không RequireAdminScope, không OriginGuard: xác thực bằng header Authorization (trình duyệt không tự gửi), không cookie nên không có CSRF.
@Controller('reception/appointments')
export class ReceptionAppointmentsController {
  constructor(
    @Inject(ReceptionAppointmentsService)
    private readonly service: ReceptionAppointmentsService,
  ) {}

  // 200 (mặc định của @Get). Không lịch nào khớp, hoặc trang vượt cuối ⇒ `items: []`, không 404 (A1).
  @Get()
  @Roles('LeTan')
  @Header('Cache-Control', 'no-store')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OperationsAppointmentsQueryDto,
  ): Promise<OperationsAppointmentsPage> {
    // Chuyển TƯỜNG MINH từng giá trị; `offset` là getter của DTO nên phải lấy ra tại đây
    return this.service.list(user.accountId, {
      trangThai: query.trangThai,
      chiNhanhId: query.chiNhanhId,
      chuyenKhoaId: query.chuyenKhoaId,
      bacSiId: query.bacSiId,
      dichVuKhamId: query.dichVuKhamId,
      tuNgay: query.tuNgay,
      denNgay: query.denNgay,
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
      offset: query.offset,
    });
  }

  // Chi tiết MỘT lịch. 200, hoặc 404 `KHONG_TIM_THAY` cùng thân cho mọi lý do không xem được (sai dạng do pipe; ngoài chi nhánh, không tồn tại do service).
  @Get(':maLichHen')
  @Roles('LeTan')
  @Header('Cache-Control', 'no-store')
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
  ): Promise<ReceptionAppointmentDetail> {
    return this.service.detail(user.accountId, maLichHen);
  }
}
