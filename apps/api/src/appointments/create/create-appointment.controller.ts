import { Body, Controller, Header, Inject, Post } from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
// Import GIÁ TRỊ (không `import type`) cho CreateAppointmentDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không thân không được kiểm
import {
  CreateAppointmentDto,
  type CreatedAppointment,
} from './create-appointment.dto.js';
import { CreateAppointmentService } from './create-appointment.service.js';

// Route TẠO lịch hẹn của Bệnh nhân (task B8; PLAN booking 5.9; TRACKING booking 3.21 B8-G). Controller chỉ nhận/trả; logic ở `CreateAppointmentService`.
//  - `@Roles('BenhNhan')` DUY NHẤT, ghi trên route (AR-02, QB-07). `RolesGuard` cho qua route không có `@Roles` (bài học ĐA-9b của B7), nên dòng này là thứ duy nhất chặn Lễ tân, Bác sĩ, Quản trị viên.
//    Guard chạy TRƯỚC pipe nên người sai vai trò gửi thân sai vẫn nhận 403 `KHONG_DU_QUYEN`, không phải 400 hay 409.
//  - Chủ sở hữu CHỈ lấy từ access token qua `CurrentUser()` (QB-03, DL-25): thân không có `benhNhanId`, `bacSiId`, `chiNhanhId`, `dichVuKhamId`, `trangThai` (gửi lên là 400 `TRUONG_KHONG_DUOC_PHEP`).
//  - `@Post` mặc định trả 201, đúng hợp đồng: route này TẠO lịch hẹn. KHÔNG `@HttpCode`.
//  - `@Header('Cache-Control', 'no-store')`: dữ liệu cá nhân. Nest áp header SAU guard và TRƯỚC pipe, nên 400 do DTO và lỗi nghiệp vụ do dịch vụ ném đều có; 401 và 403 do guard thì KHÔNG hứa
//    (guard chạy trước `@Header`; B3 và B7 đã đo). Không sửa guard và không ghim thiếu sót đó ở test.
//  - Không RequireAdminScope, không OriginGuard: xác thực bằng header Authorization (trình duyệt không tự gửi), không cookie nên không có CSRF.
@Controller('booking')
export class CreateAppointmentController {
  constructor(
    @Inject(CreateAppointmentService)
    private readonly service: CreateAppointmentService,
  ) {}

  // Chuyển TƯỜNG MINH từng trường của thân, không truyền nguyên DTO. `lyDoKham` vắng ⇒ `undefined` (class-transformer không chạy `@Transform` cho khoá không có) ⇒ `null`.
  @Post('appointments')
  @Roles('BenhNhan')
  @Header('Cache-Control', 'no-store')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateAppointmentDto,
  ): Promise<CreatedAppointment> {
    return this.service.create(user.accountId, {
      khungGioId: body.khungGioId,
      hoSoNguoiThanId: body.hoSoNguoiThanId ?? null,
      lyDoKham: body.lyDoKham ?? null,
    });
  }
}
