import {
  Body,
  Controller,
  Get,
  Header,
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
import { ParseAppointmentCodePipe } from '../appointment-code.pipe.js';
// Import GIÁ TRỊ (không `import type`) cho hai lớp DTO: ValidationPipe cần metadata của lớp lúc chạy, nếu không thân và query không được kiểm
import {
  ReschedulePreviewQueryDto,
  type RescheduledResult,
} from './patient-reschedule.dto.js';
import {
  ReceptionRescheduleDto,
  type ReceptionReschedulePreviewResult,
} from './reception-reschedule.dto.js';
import { ReceptionReschedulePreviewService } from './reception-reschedule-preview.service.js';
import { ReceptionRescheduleService } from './reception-reschedule.service.js';

// Hai route đổi lịch HỘ của Lễ tân (reschedule B7; PLAN reschedule 5.8; TRACKING reschedule 1.11). Controller chỉ nhận/trả; logic ở `ReceptionReschedulePreviewService` và `ReceptionRescheduleService`.
//  - Cùng tiền tố `reception/appointments` với controller của B3 và B12; đoạn `:maLichHen/reschedule-preview` và `:maLichHen/reschedule` nhiều hơn một đoạn nên không đụng `GET :maLichHen`.
//  - `@Roles('LeTan')` GHI TRÊN TỪNG route (AR-02, QB-07; bài học ĐA-9b): Bệnh nhân, Bác sĩ, Quản trị viên (cả hai phạm vi) nhận 403 `KHONG_DU_QUYEN` (KHÔNG có route đổi hộ cho Quản trị viên, Q7 (i)), khách 401. Guard chạy
//    TRƯỚC pipe và DTO nên người sai vai trò gửi mã sai dạng hay thân sai vẫn nhận 403 (hay 401), không phải 404 hay 400.
//  - `@Param` đứng TRƯỚC `@Query`/`@Body`: mã sai dạng ⇒ 404 `KHONG_TIM_THAY` của pipe (cùng thân với "không có" và "ngoài chi nhánh") thắng 400 của DTO.
//  - Chi nhánh KHÔNG có đường nào từ client: dịch vụ đọc `le_tan.chi_nhanh_id` ở DB mỗi request (`ReceptionScopeService`); khoá lạ trong thân hay query (`chiNhanhId`, `benhNhanId`, `lyDoYeuCau`…) là 400
//    `DU_LIEU_KHONG_HOP_LE`, `loi[].ma` `TRUONG_KHONG_DUOC_PHEP`.
//  - `GET` trả 200 mặc định. `POST` trả 201 mặc định của `@Post` (hợp đồng PLAN 5.8: đổi lịch TẠO lịch mới), KHÔNG `@HttpCode`.
//  - `@Header('Cache-Control', 'no-store')`: dữ liệu cá nhân. Áp SAU guard và TRƯỚC pipe, nên 400 do DTO, 404 và lỗi nghiệp vụ do dịch vụ ném đều có; 401 và 403 do guard thì KHÔNG hứa.
//  - Không RequireAdminScope, không OriginGuard: xác thực bằng header Authorization (trình duyệt không tự gửi), không cookie nên không có CSRF.
@Controller('reception/appointments')
export class ReceptionRescheduleController {
  constructor(
    @Inject(ReceptionReschedulePreviewService)
    private readonly previewService: ReceptionReschedulePreviewService,
    @Inject(ReceptionRescheduleService)
    private readonly rescheduleService: ReceptionRescheduleService,
  ) {}

  // CHỈ ĐỌC (không khoá, không ghi). Lịch không xem được ⇒ 404 `KHONG_TIM_THAY` cùng thân; lỗi của lịch (quá cửa sổ tiếp đón, `DaDoiLich`…) ra 200 `choPhepDoi: false` kèm `lyDoKhongDoi`.
  @Get(':maLichHen/reschedule-preview')
  @Roles('LeTan')
  @Header('Cache-Control', 'no-store')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
    @Query() query: ReschedulePreviewQueryDto,
  ): Promise<ReceptionReschedulePreviewResult> {
    return this.previewService.preview(
      user.accountId,
      maLichHen,
      query.khungGioId,
    );
  }

  // Chuyển TƯỜNG MINH từng trường của thân, không truyền nguyên DTO.
  @Post(':maLichHen/reschedule')
  @Roles('LeTan')
  @Header('Cache-Control', 'no-store')
  reschedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
    @Body() body: ReceptionRescheduleDto,
  ): Promise<RescheduledResult> {
    return this.rescheduleService.reschedule(user.accountId, maLichHen, {
      khungGioId: body.khungGioId,
      lyDo: body.lyDo,
    });
  }
}
