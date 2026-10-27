// Decorator dùng chung cho trường email/SĐT/mật khẩu của mọi DTO (đăng ký, đăng nhập, quên/đổi mật khẩu, kích hoạt nhân sự).
// Mã lỗi nằm trong ValidationError.constraints của đúng trường; cách gói thành JSON trả về là việc của bộ lọc lỗi chung (task P5).
import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ValidateBy, type ValidationOptions } from 'class-validator';
import { checkPassword } from '../password/password-policy.js';
import { isValidEmail, normalizeEmail } from '../validation/email-policy.js';
import { normalizePhone } from '../validation/phone-policy.js';
import { VALIDATION_CODES } from '../validation/validation-codes.js';

// Chuẩn hoá chạy lúc chuyển body thành DTO (ValidationPipe có transform: true), trước khi kiểm.
// Giá trị không phải chuỗi được giữ nguyên để bước kiểm báo lỗi đúng mã của trường đó.
function transformString(normalize: (text: string) => string) {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalize(value) : value,
  );
}

export function IsAccountEmail(options?: ValidationOptions): PropertyDecorator {
  return applyDecorators(
    transformString(normalizeEmail),
    ValidateBy(
      {
        name: 'isAccountEmail',
        validator: {
          validate: (value: unknown) =>
            typeof value === 'string' && isValidEmail(value),
          defaultMessage: () => VALIDATION_CODES.INVALID_EMAIL,
        },
      },
      options,
    ),
  );
}

// Sau khi qua kiểm, giá trị trong DTO là số 10 chữ số liền
export function IsAccountPhone(options?: ValidationOptions): PropertyDecorator {
  return applyDecorators(
    // Không hợp lệ thì giữ nguyên chuỗi gốc để bước kiểm báo lỗi
    transformString((text) => normalizePhone(text) ?? text),
    ValidateBy(
      {
        name: 'isAccountPhone',
        validator: {
          validate: (value: unknown) =>
            typeof value === 'string' && normalizePhone(value) === value,
          defaultMessage: () => VALIDATION_CODES.INVALID_PHONE,
        },
      },
      options,
    ),
  );
}

// KHÔNG chuẩn hoá mật khẩu (không trim): xem password/password-policy.ts
export function IsAccountPassword(
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isAccountPassword',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && checkPassword(value) === null,
        // Thông điệp chỉ là mã lỗi, không bao giờ chèn giá trị mật khẩu vào
        defaultMessage: (args) => {
          const value: unknown = args?.value;
          return (
            (typeof value === 'string' ? checkPassword(value) : null) ??
            VALIDATION_CODES.INVALID_PASSWORD
          );
        },
      },
    },
    options,
  );
}

// Trường xác nhận phải là chuỗi và bằng đúng trường `property` của cùng DTO (thiếu trường xác nhận cũng là lỗi)
export function MatchesField(
  property: string,
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'matchesField',
      constraints: [property],
      validator: {
        validate: (value: unknown, args) => {
          const other = (args?.object as Record<string, unknown> | undefined)?.[
            property
          ];
          return typeof value === 'string' && value === other;
        },
        defaultMessage: () => VALIDATION_CODES.PASSWORD_CONFIRMATION_MISMATCH,
      },
    },
    options,
  );
}
