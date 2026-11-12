import {
  Body,
  Controller,
  Get,
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
import { AppointmentCancellationService } from './appointment-cancellation.service.js';
import { cancelOutcomeException } from './cancel-failure.js';
import { CancelPreviewService } from './cancel-preview.service.js';
// Import GIÁ TRỊ (không `import type`) cho PatientCancelDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không thân không được kiểm
import {
  PatientCancelDto,
  type CancelPreview,
  type PatientCancelResult,
} from './patient-cancel.dto.js';

// Hai route huỷ của Bệnh nhân (task B10; PLAN booking 5.6, 5.9; TRACKING 3.23 B10-G). Controller chỉ nhận/trả; logic ở `CancelPreviewService` và `AppointmentCancellationService`.
//  - Cùng tiền tố `patient/appointments` với controller của B1, B2; đoạn `:maLichHen/cancel-preview` và `:maLichHen/cancel` nhiều hơn một đoạn nên không đụng `GET :maLichHen`.
//  - `@Roles('BenhNhan')` GHI TRÊN TỪNG route (AR-02, QB-07; bài học ĐA-9b): mọi vai trò khác nhận 403 `KHONG_DU_QUYEN`. Guard chạy TRƯỚC pipe và DTO nên người sai vai trò gửi mã sai dạng hay thân sai vẫn nhận 403.
//  - Chủ sở hữu CHỈ lấy từ access token qua `CurrentUser()` (QB-03); thân không có `benhNhanId` (gửi lên là 400 `TRUONG_KHONG_DUOC_PHEP`).
//  - `@Header('Cache-Control', 'no-store')` (như B2, B7): dữ liệu cá nhân. Áp SAU guard và TRƯỚC pipe nên 404 do pipe, 400 do DTO và lỗi nghiệp vụ do dịch vụ ném đều có; 401 và 403 do guard thì KHÔNG hứa.
//  - Không RequireAdminScope, không OriginGuard: xác thực bằng header Authorization (trình duyệt không tự gửi), không cookie nên không có CSRF.
@Controller('patient/appointments')
export class PatientCancelController {
  constructor(
    @Inject(CancelPreviewService)
    private readonly previewService: CancelPreviewService,
    @Inject(AppointmentCancellationService)
    private readonly cancellation: AppointmentCancellationService,
  ) {}

  // 200 (mặc định của @Get), CHỈ ĐỌC. 404 `KHONG_TIM_THAY` cùng thân cho mã sai dạng (pipe), lịch của người khác, không tồn tại và `DaDoiLich` (service).
  @Get(':maLichHen/cancel-preview')
  @Roles('BenhNhan')
  @Header('Cache-Control', 'no-store')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
  ): Promise<CancelPreview> {
    return this.previewService.preview(user.accountId, maLichHen);
  }

  // `@HttpCode(200)`: `@Post` mặc định trả 201, mà hợp đồng là 200 (huỷ, không tạo gì). Chuyển TƯỜNG MINH từng trường của thân, không truyền nguyên DTO. Kết quả không thành công đổi sang lỗi API
  // bằng `cancelOutcomeException` (dùng chung với B12, B14): `NotFound` ⇒ 404, `AlreadyCancelled` và `NotCancellable` ⇒ 409 `LICH_HEN_KHONG_CHO_HUY` kèm `chiTiet.trangThai`.
  @Post(':maLichHen/cancel')
  @HttpCode(200)
  @Roles('BenhNhan')
  @Header('Cache-Control', 'no-store')
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
    @Body() body: PatientCancelDto,
  ): Promise<PatientCancelResult> {
    const outcome = await this.cancellation.cancel({
      maLichHen,
      actor: { kind: 'BenhNhan', accountId: user.accountId },
      reason: 'BenhNhanHuy',
      ...(body.lyDo === undefined ? {} : { lyDo: body.lyDo }),
    });
    if (outcome.kind !== 'Cancelled') throw cancelOutcomeException(outcome);
    return {
      maLichHen: outcome.maLichHen,
      trangThai: 'DaHuy',
      hoanCoc: outcome.hoanCoc,
    };
  }
}
