import { IsAccountPassword, MatchesField } from './account-field.decorators.js';
import { IsLoginPassword } from './login.dto.js';

// Thân của POST /auth/change-password (task A13; PLAN 5.1): CHỈ ba trường, trường lạ (taiKhoanId, email…) bị ValidationPipe từ chối; tài khoản lấy từ access token.
// `matKhauCu` chỉ bị chặn ở biên khi không thể là mật khẩu của ai (như LoginDto): không dùng chính sách đặt mật khẩu, vì mật khẩu cũ có thể yếu hơn chính sách hiện hành.
export class ChangePasswordDto {
  @IsLoginPassword()
  matKhauCu!: string;

  @IsAccountPassword()
  matKhauMoi!: string;

  // Chỉ để đối chiếu với matKhauMoi, không bao giờ được lưu hay chuyển đi
  @MatchesField('matKhauMoi')
  xacNhan!: string;
}
