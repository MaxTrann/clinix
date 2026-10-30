import { IsAccountEmail } from './account-field.decorators.js';
import { IsOtpCode } from './otp-field.decorators.js';

// Thân của POST /auth/forgot-password và /resend-otp (task A11): CHỈ `email`. Thân của /verify-otp: `email` và `otp`.
// KHÔNG có `maXacThucId`: xác minh luôn nhắm mã QuenMatKhau đã gửi thành công mới nhất của tài khoản (PLAN 5.1, TRACKING A11-B). Trường lạ bị ValidationPipe từ chối.
// Email dùng đúng decorator và chuẩn hoá của đăng ký (A1: cắt khoảng trắng, tên miền chữ thường); DB so không phân biệt hoa/thường.
export class ForgotPasswordDto {
  @IsAccountEmail()
  email!: string;
}

export class VerifyForgotPasswordOtpDto extends ForgotPasswordDto {
  @IsOtpCode()
  otp!: string;
}
