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
  PatientRescheduleDto,
  ReschedulePreviewQueryDto,
  type ReschedulePreviewResult,
  type RescheduleResult,
} from './patient-reschedule.dto.js';
import { PatientRescheduleService } from './patient-reschedule.service.js';
import { ReschedulePreviewService } from './reschedule-preview.service.js';

// Hai route đổi lịch của Bệnh nhân (reschedule B6; PLAN reschedule 5.8; TRACKING reschedule 1.10). Controller chỉ nhận/trả; logic ở `ReschedulePreviewService` và `PatientRescheduleService`.
//  - Cùng tiền tố `patient/appointments` với controller của B1, B2, B10; đoạn `:maLichHen/reschedule-preview` và `:maLichHen/reschedule` nhiều hơn một đoạn nên không đụng `GET :maLichHen`.
//  - `@Roles('BenhNhan')` GHI TRÊN TỪNG route (AR-02, QB-07; bài học ĐA-9b): mọi vai trò khác nhận 403 `KHONG_DU_QUYEN`, khách 401. Guard chạy TRƯỚC pipe và DTO nên người sai vai trò gửi mã sai dạng hay thân sai
//    vẫn nhận 403 (hay 401), không phải 404 hay 400.
//  - `@Param` đứng TRƯỚC `@Query`/`@Body`: mã sai dạng ⇒ 404 `KHONG_TIM_THAY` của pipe (cùng thân với "không có" và "của người khác") thắng 400 của DTO.
//  - Chủ sở hữu CHỈ lấy từ access token qua `CurrentUser()` (QB-03); thân và query không có `benhNhanId` (gửi lên là 400 `DU_LIEU_KHONG_HOP_LE`, `loi[].ma` `TRUONG_KHONG_DUOC_PHEP`).
//  - `GET` trả 200 mặc định. `POST` trả 201 mặc định của `@Post` (hợp đồng PLAN 5.8: đổi lịch TẠO lịch mới hoặc yêu cầu), KHÔNG `@HttpCode`.
//  - `@Header('Cache-Control', 'no-store')`: dữ liệu cá nhân. Áp SAU guard và TRƯỚC pipe, nên 400 do DTO, 404 và lỗi nghiệp vụ do dịch vụ ném đều có; 401 và 403 do guard thì KHÔNG hứa (B3, B7, B8 đã đo).
//  - Không RequireAdminScope, không OriginGuard: xác thực bằng header Authorization (trình duyệt không tự gửi), không cookie nên không có CSRF.
@Controller('patient/appointments')
export class PatientRescheduleController {
  constructor(
    @Inject(ReschedulePreviewService)
    private readonly previewService: ReschedulePreviewService,
    @Inject(PatientRescheduleService)
    private readonly rescheduleService: PatientRescheduleService,
  ) {}

  // CHỈ ĐỌC (không khoá, không ghi). Lịch không xem được ⇒ 404 `KHONG_TIM_THAY` cùng thân; lỗi của lịch (quá giờ, không đổi được…) ra 200 `choPhepDoi: false` kèm `lyDoKhongDoi`.
  @Get(':maLichHen/reschedule-preview')
  @Roles('BenhNhan')
  @Header('Cache-Control', 'no-store')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
    @Query() query: ReschedulePreviewQueryDto,
  ): Promise<ReschedulePreviewResult> {
    return this.previewService.preview(
      user.accountId,
      maLichHen,
      query.khungGioId,
    );
  }

  // Chuyển TƯỜNG MINH từng trường của thân, không truyền nguyên DTO. `lyDoYeuCau` vắng ⇒ không có khoá (exactOptionalPropertyTypes).
  @Post(':maLichHen/reschedule')
  @Roles('BenhNhan')
  @Header('Cache-Control', 'no-store')
  reschedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
    @Body() body: PatientRescheduleDto,
  ): Promise<RescheduleResult> {
    return this.rescheduleService.reschedule(user.accountId, maLichHen, {
      khungGioId: body.khungGioId,
      ...(body.lyDoYeuCau === undefined ? {} : { lyDoYeuCau: body.lyDoYeuCau }),
    });
  }
}
