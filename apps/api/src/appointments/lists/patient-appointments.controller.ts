import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { ParseAppointmentCodePipe } from '../appointment-code.pipe.js';
import { PatientAppointmentDetailService } from './patient-appointment-detail.service.js';
// Import GIÁ TRỊ (không `import type`) cho PatientAppointmentsQueryDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không query không được kiểm
import {
  PatientAppointmentsQueryDto,
  type PatientAppointmentDetail,
  type PatientAppointmentsPage,
} from './patient-appointments.dto.js';
import { PatientAppointmentsService } from './patient-appointments.service.js';

// Danh sách và lịch sử (task B1) và chi tiết (task B2) lịch hẹn của Bệnh nhân (PLAN booking 5.9, Q31; TRACKING 3.13 B1-B, 3.15 B2-B). Controller chỉ nhận/trả; logic ở
// PatientAppointmentsService (danh sách) và PatientAppointmentDetailService (chi tiết).
//  - `@Roles('BenhNhan')` DUY NHẤT, ghi trên route (AR-02, QB-07): Bác sĩ, Lễ tân, Quản trị viên (cả hai phạm vi) nhận 403. Guard chạy TRƯỚC pipe nên người sai vai trò
//    gửi query sai vẫn nhận 403, không phải 400.
//  - Chủ sở hữu chỉ lấy từ access token qua `CurrentUser()`; query không có `benhNhanId` (gửi lên là 400 `TRUONG_KHONG_DUOC_PHEP`). `bacSiId`, `hoSoNguoiThanId` là bộ lọc thu hẹp,
//    không phải quyền: phạm vi `benh_nhan_id` nằm trong SQL.
//  - Không RequireAdminScope, không OriginGuard: xác thực bằng header Authorization (trình duyệt không tự gửi), không cookie nên không có CSRF.
@Controller('patient/appointments')
export class PatientAppointmentsController {
  constructor(
    @Inject(PatientAppointmentsService)
    private readonly service: PatientAppointmentsService,
    @Inject(PatientAppointmentDetailService)
    private readonly detailService: PatientAppointmentDetailService,
  ) {}

  // 200 (mặc định của @Get). Không lịch nào khớp, hoặc trang vượt cuối ⇒ `items: []`, không 404 (A1).
  @Get()
  @Roles('BenhNhan')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PatientAppointmentsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PatientAppointmentsPage> {
    // Dữ liệu cá nhân: không cho trình duyệt hay proxy lưu lại. Đặt trước khi gọi service để nhánh lỗi sinh trong handler cũng có
    res.setHeader('Cache-Control', 'no-store');
    // Chuyển TƯỜNG MINH từng giá trị; `offset` là getter của DTO nên phải lấy ra tại đây
    return this.service.list(user.accountId, {
      trangThai: query.trangThai,
      nhom: query.nhom,
      hoSoNguoiThanId: query.hoSoNguoiThanId,
      bacSiId: query.bacSiId,
      chuyenKhoaId: query.chuyenKhoaId,
      tuNgay: query.tuNgay,
      denNgay: query.denNgay,
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
      offset: query.offset,
    });
  }

  // Chi tiết MỘT lịch (task B2). 200, hoặc 404 `KHONG_TIM_THAY` cùng thân cho mọi lý do không xem được (sai dạng do pipe; của người khác, không tồn tại, `DaDoiLich` do service).
  //  - `@Header('Cache-Control', 'no-store')` (không `res.setHeader` trong handler như danh sách): Nest áp header ngay sau guard và TRƯỚC pipe, nên 404 do pipe cũng có (QB-08).
  //  - `ParseAppointmentCodePipe` chuẩn hoá `maLichHen` (cắt khoảng trắng, chữ hoa) rồi kiểm mẫu; guard chạy trước pipe nên người sai vai trò gửi mã sai dạng vẫn nhận 403.
  @Get(':maLichHen')
  @Roles('BenhNhan')
  @Header('Cache-Control', 'no-store')
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
  ): Promise<PatientAppointmentDetail> {
    return this.detailService.detail(user.accountId, maLichHen);
  }
}
