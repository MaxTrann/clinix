import { ValidateBy, type ValidationOptions } from 'class-validator';
import {
  RESET_PASSWORD_ERROR_CODES,
  RESET_TOKEN_MAX_LENGTH,
} from '../auth.constants.js';
import { IsAccountPassword, MatchesField } from './account-field.decorators.js';

/** resetToken ở biên: CHUỖI 1..RESET_TOKEN_MAX_LENGTH ký tự, không trim. Chữ ký, hạn và hàng OTP do ResetPasswordService kiểm. */
export function IsResetToken(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isResetToken',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          value.length > 0 &&
          value.length <= RESET_TOKEN_MAX_LENGTH,
        // Thông điệp chỉ là mã lỗi, không bao giờ chèn giá trị token vào
        defaultMessage: () => RESET_PASSWORD_ERROR_CODES.INVALID_TOKEN_FIELD,
      },
    },
    options,
  );
}

// Thân của POST /auth/reset-password (task A12; PLAN 5.1): CHỈ ba trường, trường lạ (taiKhoanId, email, maXacThucId…) bị ValidationPipe từ chối.
// Mật khẩu mới sai dạng hoặc không khớp ⇒ 400 ngay ở biên, dịch vụ không chạy nên resetToken KHÔNG bị tiêu thụ và nhập lại được (S2, QM-08).
export class ResetPasswordDto {
  @IsResetToken()
  resetToken!: string;

  @IsAccountPassword()
  matKhauMoi!: string;

  // Chỉ để đối chiếu với matKhauMoi, không bao giờ được lưu hay chuyển đi
  @MatchesField('matKhauMoi')
  xacNhan!: string;
}
