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
// Import GIÁ TRỊ (không `import type`) cho ExamCompleteDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không thân không được kiểm
import {
  ExamCompleteDto,
  type ExamCompletionResult,
} from './exam-completion.dto.js';
import { ExamCompletionService } from './exam-completion.service.js';

// `POST /doctor/appointments/:maLichHen/complete` (doctor-exam B1; PLAN 5.4, 5.11; Q5). Controller chỉ nhận/trả; logic ở `ExamCompletionService`.
//  - `@Roles('BacSi')` GHI TRÊN route (AR-02, QHK-09): Bệnh nhân, Lễ tân, Quản trị viên nhận 403 `KHONG_DU_QUYEN`. Guard chạy TRƯỚC pipe và DTO nên người sai vai trò gửi mã sai dạng hay thân lạ
//    vẫn nhận 403.
//  - Bác sĩ CHỈ lấy từ access token (`user.accountId`, đã đối chiếu DB ở guard); thân phải rỗng (`ExamCompleteDto`): khoá lạ như `bacSiId` là 400 `TRUONG_KHONG_DUOC_PHEP` (QHK-02).
//  - `@HttpCode(200)`: `@Post` mặc định trả 201, mà hợp đồng là 200 (đổi trạng thái, không tạo tài nguyên).
//  - `@Header('Cache-Control', 'no-store')`: áp SAU guard và TRƯỚC pipe nên 404 do pipe, 400 do DTO và lỗi nghiệp vụ cũng có (QHK-12).
//  - Cùng tiền tố `doctor/appointments` với controller của booking B5 (chỉ có `GET`); không đụng nhau. Không OriginGuard: xác thực bằng header Authorization, không cookie nên không có CSRF.
@Controller('doctor/appointments')
export class ExamCompletionController {
  constructor(
    @Inject(ExamCompletionService)
    private readonly service: ExamCompletionService,
  ) {}

  @Post(':maLichHen/complete')
  @HttpCode(200)
  @Roles('BacSi')
  @Header('Cache-Control', 'no-store')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
    @Body() _body: ExamCompleteDto,
  ): Promise<ExamCompletionResult> {
    return this.service.complete(user.accountId, maLichHen);
  }
}
