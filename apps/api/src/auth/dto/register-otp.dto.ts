import { IsAccountEmail } from './account-field.decorators.js';
import { IsOtpCode, IsVerificationId } from './otp-field.decorators.js';

// Thân của POST /auth/register/verify-otp và /resend-otp (task A6; phương án B của rủi ro id tuần tự, TECH_DEBT 23).
// `maXacThucId` là số tuần tự nên một mình nó không đủ làm "chìa khoá": kèm `email` (khó đoán hơn nhiều) để dịch vụ tra tài khoản
// theo email rồi bắt buộc hàng OTP phải thuộc đúng tài khoản đó (OtpService `expectedTaiKhoanId`). Trường lạ bị ValidationPipe từ chối.
// Email dùng đúng decorator và cách chuẩn hoá của đăng ký (A1), nên cùng một địa chỉ viết khác hoa/thường vẫn ra cùng một tài khoản.
export class ResendRegisterOtpDto {
  @IsAccountEmail()
  email!: string;

  @IsVerificationId()
  maXacThucId!: string;
}

export class VerifyRegisterOtpDto extends ResendRegisterOtpDto {
  @IsOtpCode()
  otp!: string;
}
