import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
import { ResetPasswordDto } from '../dto/reset-password.dto.js';
import {
  ResetPasswordService,
  type ResetPasswordResult,
} from './reset-password.service.js';

// Quên mật khẩu (2), đặt mật khẩu mới (task A12). Controller chỉ nhận/trả; logic ở ResetPasswordService. Đặt riêng (không thêm vào ForgotPasswordController)
// vì route là /auth/reset-password theo PLAN 5.1, khác tiền tố /auth/forgot-password. Công khai (`@Public()`): người dùng chưa đăng nhập; không dùng
// OriginGuard và không đọc cookie hay Authorization (route không dùng cookie). 200 { taiKhoanNgung, canDangKyLai }; không `no-store` vì phản hồi không mang token.
@Public()
@Controller('auth')
export class ResetPasswordController {
  constructor(
    @Inject(ResetPasswordService)
    private readonly service: ResetPasswordService,
  ) {}

  // Không tạo tài nguyên REST mà client đọc lại nên 200, không phải 201 (như verify-otp)
  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<ResetPasswordResult> {
    return this.service.reset({
      resetToken: dto.resetToken,
      matKhauMoi: dto.matKhauMoi,
    });
  }
}
