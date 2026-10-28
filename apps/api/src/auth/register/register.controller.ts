import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
import {
  ResendRegisterOtpDto,
  VerifyRegisterOtpDto,
} from '../dto/register-otp.dto.js';
import { RegisterDto } from '../dto/register.dto.js';
import { RegisterVerificationService } from './register-verification.service.js';
import { RegisterService } from './register.service.js';
import type { RegisterResult } from './register.types.js';

// Đăng ký tài khoản Bệnh nhân (task A5) và xác minh OTP / gửi lại mã (task A6). Controller chỉ nhận/trả; logic ở RegisterService và
// RegisterVerificationService. Cả ba endpoint CÔNG KHAI (chưa có tài khoản đăng nhập, A4-E): `@Public()` ở cấp class để route mới thêm
// vào đây cũng công khai, không thể quên.
// POST / và /resend-otp: 201 chỉ có { maXacThucId, hetHanLuc, coTheGuiLaiLuc } (Date thành chuỗi ISO UTC khi ra JSON); KHÔNG bao giờ có OTP.
// POST /verify-otp: 200 { daXacMinh: true }; KHÔNG có token, cookie, email hay mã tài khoản (đăng nhập là việc của A8, ĐK b10).
@Public()
@Controller('auth/register')
export class RegisterController {
  constructor(
    @Inject(RegisterService) private readonly register: RegisterService,
    @Inject(RegisterVerificationService)
    private readonly verification: RegisterVerificationService,
  ) {}

  @Post()
  create(@Body() dto: RegisterDto): Promise<RegisterResult> {
    // Chép từng trường: `xacNhan` dừng ở DTO, không đi tiếp vào dịch vụ
    return this.register.register({
      hoTen: dto.hoTen,
      email: dto.email,
      soDienThoai: dto.soDienThoai,
      matKhau: dto.matKhau,
    });
  }

  // Không tạo tài nguyên mới theo nghĩa REST (tài khoản đã có từ lúc đăng ký) nên 200, không phải 201
  @Post('verify-otp')
  @HttpCode(200)
  async verifyOtp(
    @Body() dto: VerifyRegisterOtpDto,
  ): Promise<{ daXacMinh: true }> {
    await this.verification.verifyOtp({
      email: dto.email,
      maXacThucId: dto.maXacThucId,
      otp: dto.otp,
    });
    return { daXacMinh: true };
  }

  @Post('resend-otp')
  resendOtp(@Body() dto: ResendRegisterOtpDto): Promise<RegisterResult> {
    return this.verification.resendOtp({
      email: dto.email,
      maXacThucId: dto.maXacThucId,
    });
  }
}
