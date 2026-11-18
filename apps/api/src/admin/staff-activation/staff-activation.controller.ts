import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator.js';
import { CompleteStaffActivationDto } from './staff-activation.dto.js';
import {
  StaffActivationService,
  type CompleteActivationResult,
  type ValidateActivationResult,
} from './staff-activation.service.js';

// Kích hoạt tài khoản nhân sự CÔNG KHAI (task B16; PLAN admin 5.3 và 5.5). Controller chỉ nhận/trả; logic ở StaffActivationService.
//  - Đường dẫn `/staff-activation/*` (KHÔNG nằm dưới `admin/`) nên bộ quét `admin-scope` không xét hai route này; `E2E-KH06` khẳng định đúng hai route là công khai.
//  - `@Public()` cấp lớp: người nhận thư chưa có tài khoản đăng nhập được. Không đọc cookie hay Authorization, không đặt cookie (SE-A13).
//  - Không dùng OriginGuard: auth chỉ áp cho route dùng cookie (refresh, logout); hai route này không có CSRF qua cookie và token trong thân là bí mật 256 bit.
//  - Cả hai trả 200 (không tạo tài nguyên mà client đọc lại), như verify-otp và reset-password. Thất bại: 400 LIEN_KET_KHONG_HOP_LE, cùng một thân cho mọi lý do.
@Public()
@Controller('staff-activation')
export class StaffActivationController {
  constructor(
    @Inject(StaffActivationService)
    private readonly service: StaffActivationService,
  ) {}

  // Thân nhận kiểu `unknown` (không lớp DTO) để ValidationPipe toàn cục bỏ qua: mọi lỗi định dạng phải ra CÙNG LIEN_KET_KHONG_HOP_LE (NS-35)
  @Post('validate')
  @HttpCode(200)
  validate(@Body() body: unknown): Promise<ValidateActivationResult> {
    return this.service.validate(body);
  }

  @Post('complete')
  @HttpCode(200)
  complete(
    @Body() dto: CompleteStaffActivationDto,
  ): Promise<CompleteActivationResult> {
    return this.service.complete({
      id: dto.id,
      token: dto.token,
      matKhauMoi: dto.matKhauMoi,
    });
  }
}
