import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { ParseAppointmentCodePipe } from '../../../appointments/appointment-code.pipe.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../../auth/decorators/roles.decorator.js';
// Import GIÁ TRỊ (không `import type`) cho RatingDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không thân không được kiểm
import { RatingDto, type RatingView } from './rating.dto.js';
import { RatingService } from './rating.service.js';

// `POST /patient/exam-records/:maLichHen/rating` (doctor-exam B6; PLAN 5.7, 5.11; Q7). Controller chỉ nhận/trả; logic ở `RatingService`.
//  - `@Roles('BenhNhan')` GHI TRÊN route (AR-02, QHK-09): Bác sĩ (kể cả bác sĩ của lịch), Lễ tân, Quản trị viên nhận 403 `KHONG_DU_QUYEN`. Guard chạy TRƯỚC pipe và DTO nên người sai vai trò gửi mã sai dạng hay thân lạ vẫn nhận 403.
//  - Chủ sở hữu CHỈ lấy từ access token (`user.accountId`); khoá lạ ở thân (`benhNhanId`, `bacSiId`, `biAn`, `lichHenId`…) là 400 `TRUONG_KHONG_DUOC_PHEP` (DGB-10, QHK-03).
//  - `@HttpCode(201)`: tạo mới MỘT đánh giá (không có "sửa": lần hai là 409).
//  - `@Header('Cache-Control', 'no-store')`: áp SAU guard và TRƯỚC pipe nên 404 do pipe, 400 do DTO và lỗi nghiệp vụ cũng có (QHK-12). Nhận xét là dữ liệu của người dùng.
//  - Cùng tiền tố `patient/exam-records` với `PatientExamRecordsController` (B4, B5: `GET`); không đụng nhau. Không OriginGuard: xác thực bằng header Authorization, không cookie.
@Controller('patient/exam-records')
export class RatingController {
  constructor(@Inject(RatingService) private readonly service: RatingService) {}

  @Post(':maLichHen/rating')
  @HttpCode(201)
  @Roles('BenhNhan')
  @Header('Cache-Control', 'no-store')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
    @Body() body: RatingDto,
  ): Promise<RatingView> {
    return this.service.submit(user.accountId, maLichHen, body);
  }
}
