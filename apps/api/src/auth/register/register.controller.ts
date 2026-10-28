import { Body, Controller, Inject, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
import { RegisterDto } from '../dto/register.dto.js';
import { RegisterService } from './register.service.js';
import type { RegisterResult } from './register.types.js';

// Đăng ký tài khoản Bệnh nhân (task A5). Controller chỉ nhận/trả; logic ở RegisterService. Endpoint CÔNG KHAI (chưa có tài khoản đăng nhập,
// A4-E): `@Public()` ở cấp class để A6 thêm `verify-otp` và `resend-otp` vào đúng controller này cũng công khai.
// Phản hồi 201 chỉ có { maXacThucId, hetHanLuc, coTheGuiLaiLuc } (Date thành chuỗi ISO UTC khi ra JSON); KHÔNG bao giờ có OTP.
@Public()
@Controller('auth/register')
export class RegisterController {
  constructor(
    @Inject(RegisterService) private readonly register: RegisterService,
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
}
