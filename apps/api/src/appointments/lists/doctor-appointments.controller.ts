import { Controller, Get, Header, Inject, Param, Query } from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { ParseAppointmentCodePipe } from '../appointment-code.pipe.js';
// Import GIÁ TRỊ (không `import type`) cho DoctorAppointmentsQueryDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không query không được kiểm
import {
  DoctorAppointmentsQueryDto,
  type DoctorAppointmentDetail,
  type DoctorAppointmentsPage,
} from './doctor-appointments.dto.js';
import { DoctorAppointmentsService } from './doctor-appointments.service.js';

// Danh sách và chi tiết lịch hẹn của BÁC SĨ (task B5, use case XDSPC; PLAN booking 5.9, Q33; TRACKING 3.20 B5-D). Controller chỉ nhận/trả; logic ở DoctorAppointmentsService.
//  - `@Roles('BacSi')` DUY NHẤT, ghi trên TỪNG route (AR-02, QB-02): Bệnh nhân, Lễ tân, Quản trị viên (cả hai phạm vi) nhận 403 `KHONG_DU_QUYEN`. Guard chạy TRƯỚC pipe nên người sai vai trò gửi query hay
//    mã sai vẫn nhận 403, không phải 400 hay 404.
//  - Bác sĩ KHÔNG có đường nào từ client: `user.accountId` (từ access token, đã đối chiếu DB ở guard) là `bac_si_id` trong SQL. `bacSiId` trong query (nếu đúng dạng) bị bỏ qua, KHÔNG được chuyển
//    sang service (DSB-01, QB-03).
//  - `@Header('Cache-Control', 'no-store')` (không `res.setHeader` trong handler): Nest áp header ngay sau guard và TRƯỚC pipe, nên cả 404 do pipe lẫn lỗi sinh trong handler cũng có (QB-08).
//  - Không OriginGuard: xác thực bằng header Authorization (trình duyệt không tự gửi), không cookie nên không có CSRF.
@Controller('doctor/appointments')
export class DoctorAppointmentsController {
  constructor(
    @Inject(DoctorAppointmentsService)
    private readonly service: DoctorAppointmentsService,
  ) {}

  // 200 (mặc định của @Get). Không lịch nào khớp, hoặc trang vượt cuối ⇒ `items: []`, không 404 (A1).
  @Get()
  @Roles('BacSi')
  @Header('Cache-Control', 'no-store')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DoctorAppointmentsQueryDto,
  ): Promise<DoctorAppointmentsPage> {
    // Chuyển TƯỜNG MINH từng giá trị (KHÔNG có `bacSiId`); `offset` là getter của DTO nên phải lấy ra tại đây
    return this.service.list(user.accountId, {
      trangThai: query.trangThai,
      ca: query.ca,
      tuNgay: query.tuNgay,
      denNgay: query.denNgay,
      q: query.q,
      sapXep: query.sapXep,
      page: query.page,
      pageSize: query.pageSize,
      offset: query.offset,
    });
  }

  // Chi tiết MỘT lịch. 200, hoặc 404 `KHONG_TIM_THAY` cùng thân cho mọi lý do không xem được (sai dạng do pipe; của bác sĩ khác, không tồn tại, `DaDoiLich` do service).
  @Get(':maLichHen')
  @Roles('BacSi')
  @Header('Cache-Control', 'no-store')
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
  ): Promise<DoctorAppointmentDetail> {
    return this.service.detail(user.accountId, maLichHen);
  }
}
