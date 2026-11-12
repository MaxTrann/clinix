import {
  Body,
  Controller,
  Header,
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
import { ParseAppointmentCodePipe } from '../appointment-code.pipe.js';
// Import GIÁ TRỊ (không `import type`) cho ReceptionStatusDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không thân không được kiểm
import {
  ReceptionStatusDto,
  type ReceptionStatusResult,
} from './reception-status.dto.js';
import { ReceptionStatusService } from './reception-status.service.js';

// Route ghi của LỄ TÂN (task B12; PLAN booking 5.7, 5.9; TRACKING 3.26 B12-E). Controller chỉ nhận/trả; logic ở ReceptionStatusService.
//  - Cùng tiền tố `reception/appointments` với controller của B3; đoạn đuôi `:maLichHen/status` nhiều hơn một đoạn và khác phương thức nên không đụng `GET :maLichHen`.
//  - `@Roles('LeTan')` GHI TRÊN route (AR-02, QB-07; bài học ĐA-9b): Bệnh nhân, Bác sĩ, Quản trị viên (cả hai phạm vi) nhận 403 `KHONG_DU_QUYEN`. Guard chạy TRƯỚC pipe và DTO nên người sai vai trò gửi mã
//    sai dạng hay thân sai vẫn nhận 403, không phải 404 hay 400.
//  - Chi nhánh KHÔNG có đường nào từ client: service đọc `le_tan.chi_nhanh_id` ở DB mỗi request; khoá lạ trong thân (`chiNhanhId`, `benhNhanId`…) là 400 `TRUONG_KHONG_DUOC_PHEP`.
//  - `@Header('Cache-Control', 'no-store')`: Nest áp header ngay sau guard và TRƯỚC pipe, nên 404 do pipe, 400 do DTO và lỗi nghiệp vụ do dịch vụ ném đều có (QB-08); 401 và 403 do guard thì KHÔNG hứa.
//  - Không RequireAdminScope, không OriginGuard: xác thực bằng header Authorization (trình duyệt không tự gửi), không cookie nên không có CSRF.
@Controller('reception/appointments')
export class ReceptionStatusController {
  constructor(
    @Inject(ReceptionStatusService)
    private readonly service: ReceptionStatusService,
  ) {}

  // `@HttpCode(200)`: `@Post` mặc định trả 201, mà hợp đồng là 200 (đổi trạng thái, không tạo gì). Chuyển TƯỜNG MINH từng trường của thân, không truyền nguyên DTO.
  @Post(':maLichHen/status')
  @HttpCode(200)
  @Roles('LeTan')
  @Header('Cache-Control', 'no-store')
  change(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
    @Body() body: ReceptionStatusDto,
  ): Promise<ReceptionStatusResult> {
    return this.service.change(user.accountId, maLichHen, {
      trangThai: body.trangThai,
      ...(body.lyDo === undefined ? {} : { lyDo: body.lyDo }),
    });
  }
}
