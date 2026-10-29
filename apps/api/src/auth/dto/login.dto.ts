import { ValidateBy, type ValidationOptions } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../password/password-policy.js';
import { VALIDATION_CODES } from '../validation/validation-codes.js';
import { IsAccountEmail } from './account-field.decorators.js';

// Mật khẩu ĐĂNG NHẬP chỉ bị chặn ở BIÊN khi không thể là mật khẩu của ai: không phải chuỗi, rỗng, hoặc dài hơn mức tối đa của chính sách (64).
// KHÔNG dùng IsAccountPassword (chính sách đặt mật khẩu): nó chặn mật khẩu yếu hoặc có ký tự ngoài ASCII bằng 400 mà không so và không đếm,
// nên lần đoán đó không được tính và còn lộ chính sách. Mật khẩu ngoài ASCII dưới 64 ký tự đi hết luồng như mật khẩu sai (quyết định A8-B).
// Giới hạn 64 là giữ khớp chính sách, không phải lá chắn DoS: chi phí Argon2 tính theo lần gọi, không theo độ dài (TECH_DEBT 27, X3).
// Không trim, không chuẩn hoá: giống lúc đặt mật khẩu.
export function IsLoginPassword(
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isLoginPassword',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          value.length >= 1 &&
          value.length <= PASSWORD_MAX_LENGTH,
        // Thông điệp chỉ là mã lỗi, không bao giờ chèn giá trị mật khẩu vào
        defaultMessage: () => VALIDATION_CODES.INVALID_PASSWORD,
      },
    },
    options,
  );
}

// Thân của POST /auth/login (task A8). Chỉ hai trường này; trường lạ bị ValidationPipe từ chối.
// Email dùng đúng decorator và chuẩn hoá của đăng ký (A1: cắt khoảng trắng, tên miền chữ thường), DB so không phân biệt hoa/thường (DN-04).
export class LoginDto {
  @IsAccountEmail()
  email!: string;

  @IsLoginPassword()
  matKhau!: string;
}
