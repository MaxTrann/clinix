import { FIELD_MESSAGES } from '../register/register-errors';
import { checkPassword } from './password-policy';

export interface NewPasswordErrors {
  matKhauMoi?: string;
  xacNhan?: string;
}

// Hai ô "Mật khẩu mới" và "Xác nhận" của bước 3 quên mật khẩu (F4) và đổi mật khẩu (F5): đúng quy tắc của API (Q11, N10), KHÔNG trim
export function validateNewPassword(
  matKhauMoi: string,
  xacNhan: string,
): NewPasswordErrors {
  const errors: NewPasswordErrors = {};
  const issue = checkPassword(matKhauMoi);
  if (issue) errors.matKhauMoi = FIELD_MESSAGES[issue];
  if (xacNhan !== matKhauMoi) {
    errors.xacNhan = FIELD_MESSAGES.XAC_NHAN_KHONG_KHOP;
  }
  return errors;
}
