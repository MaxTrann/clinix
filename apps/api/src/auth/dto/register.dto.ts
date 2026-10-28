import {
  IsAccountEmail,
  IsAccountFullName,
  IsAccountPassword,
  IsAccountPhone,
  MatchesField,
} from './account-field.decorators.js';

// Thân của POST /auth/register (task A5). Tên trường đã được duyệt; chỉ năm trường này, trường lạ bị ValidationPipe từ chối
// (forbidNonWhitelisted): client không gửi được loaiTaiKhoan, trangThai, daXacMinhEmail… Quy tắc từng trường nằm ở decorator của A1/A5.
export class RegisterDto {
  @IsAccountFullName()
  hoTen!: string;

  @IsAccountEmail()
  email!: string;

  @IsAccountPhone()
  soDienThoai!: string;

  @IsAccountPassword()
  matKhau!: string;

  // Chỉ để đối chiếu với matKhau, không bao giờ được lưu hay chuyển đi
  @MatchesField('matKhau')
  xacNhan!: string;
}
