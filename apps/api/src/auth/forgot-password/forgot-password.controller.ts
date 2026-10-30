import { Body, Controller, HttpCode, Inject, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../decorators/public.decorator.js';
import {
  ForgotPasswordDto,
  VerifyForgotPasswordOtpDto,
} from '../dto/forgot-password.dto.js';
import type { PasswordResetCodeResult } from './forgot-password-delivery.js';
import {
  ForgotPasswordService,
  type PasswordResetTokenResult,
} from './forgot-password.service.js';

// Quên mật khẩu (1) (task A11). Controller chỉ nhận/trả; logic ở ForgotPasswordService. Cả ba route CÔNG KHAI (chưa có tài khoản đăng nhập): `@Public()` ở
// cấp class. Không dùng OriginGuard: PLAN chỉ áp cho refresh và logout, và ba route này không dùng cookie.
//  - POST / và /resend-otp: 201 { hetHanLuc, coTheGuiLaiLuc }, CÙNG một hàm của dịch vụ; KHÔNG bao giờ có OTP hay mã lần gửi.
//  - POST /verify-otp: 200 { resetToken, hetHanLuc } kèm `Cache-Control: no-store`, vì phản hồi mang token (như đăng nhập, làm mới).
@Public()
@Controller('auth/forgot-password')
export class ForgotPasswordController {
  constructor(
    @Inject(ForgotPasswordService)
    private readonly service: ForgotPasswordService,
  ) {}

  @Post()
  requestCode(
    @Body() dto: ForgotPasswordDto,
  ): Promise<PasswordResetCodeResult> {
    return this.service.requestCode(dto.email);
  }

  @Post('resend-otp')
  resendOtp(@Body() dto: ForgotPasswordDto): Promise<PasswordResetCodeResult> {
    return this.service.requestCode(dto.email);
  }

  // Không tạo tài nguyên REST mà client đọc lại nên 200, không phải 201 (như verify-otp của A6)
  @Post('verify-otp')
  @HttpCode(200)
  async verifyOtp(
    @Body() dto: VerifyForgotPasswordOtpDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PasswordResetTokenResult> {
    const result = await this.service.verifyCode(dto.email, dto.otp);
    // Phản hồi mang token: không cho trình duyệt hay proxy lưu lại
    res.setHeader('Cache-Control', 'no-store');
    return result;
  }
}
