import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Param,
  Put,
} from '@nestjs/common';
import { ParseAppointmentCodePipe } from '../../../appointments/appointment-code.pipe.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../../auth/decorators/roles.decorator.js';
// Import GIÁ TRỊ (không `import type`) cho ExamRecordDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không thân không được kiểm
import { ExamRecordDto, type ExamRecordView } from './exam-record.dto.js';
import { ExamRecordService } from './exam-record.service.js';

// `PUT /doctor/appointments/:maLichHen/exam-record` (doctor-exam B2; PLAN 5.5, 5.11; Q2 đến Q4). Controller chỉ nhận/trả; logic ở `ExamRecordService`.
//  - `@Roles('BacSi')` GHI TRÊN route (AR-02, QHK-09): Bệnh nhân, Lễ tân, Quản trị viên nhận 403 `KHONG_DU_QUYEN`. Guard chạy TRƯỚC pipe và DTO nên người sai vai trò gửi mã sai dạng hay thân lạ vẫn nhận 403.
//  - Bác sĩ CHỈ lấy từ access token (`user.accountId`); khoá lạ ở thân (`bacSiId`, `lichHenId`, `benhNhanId`…) là 400 `TRUONG_KHONG_DUOC_PHEP` (QHK-02, HSK-15).
//  - `@HttpCode(200)` cho cả ghi lần đầu và sửa (PLAN 5.5: không phân biệt 201/200).
//  - `@Header('Cache-Control', 'no-store')`: áp SAU guard và TRƯỚC pipe nên 404 do pipe, 400 do DTO và lỗi nghiệp vụ cũng có (QHK-12). Thân và kết quả là dữ liệu SỨC KHOẺ.
//  - Cùng tiền tố `doctor/appointments` với controller của booking B5 (`GET`) và `ExamCompletionController` (`POST …/complete`); không đụng nhau. Không OriginGuard: xác thực bằng header Authorization, không cookie.
@Controller('doctor/appointments')
export class ExamRecordController {
  constructor(
    @Inject(ExamRecordService) private readonly service: ExamRecordService,
  ) {}

  @Put(':maLichHen/exam-record')
  @HttpCode(200)
  @Roles('BacSi')
  @Header('Cache-Control', 'no-store')
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
    @Body() body: ExamRecordDto,
  ): Promise<ExamRecordView> {
    return this.service.save(user.accountId, maLichHen, body);
  }
}
