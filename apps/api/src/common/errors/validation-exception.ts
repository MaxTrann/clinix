import type { ValidationError } from 'class-validator';
import { AppException, type FieldError } from './app.exception.js';
import {
  COMMON_ERROR_CODES,
  FIELD_ERROR_CODES,
  INVALID_DATA_MESSAGE,
  isErrorCode,
} from './error-codes.js';

const MAX_FIELD_PATH_LENGTH = 100;

// Mã của một ràng buộc: DTO của dự án đặt `message` = mã (A1) thì dùng nguyên; còn lại là ràng buộc có sẵn của class-validator,
// lấy tên ràng buộc viết SNAKE_CASE hoa (isString → IS_STRING). Tên này là API của thư viện nên ổn định.
function codeOf(constraint: string, message: string): string {
  if (isErrorCode(message)) return message;
  if (constraint === 'whitelistValidation') {
    return FIELD_ERROR_CODES.NOT_ALLOWED;
  }
  return constraint.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

// Dàn phẳng cây lỗi của class-validator thành loi[{truong, ma}]. Chỉ đọc `property` và `constraints`; KHÔNG đọc `value`/`target`
// (có thể chứa mật khẩu), và không chép thông điệp tự do của thư viện.
export function flattenValidationErrors(
  errors: readonly ValidationError[],
  parentPath = '',
): FieldError[] {
  const result: FieldError[] = [];
  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    for (const [constraint, message] of Object.entries(
      error.constraints ?? {},
    )) {
      result.push({
        truong: (path || 'body').slice(0, MAX_FIELD_PATH_LENGTH),
        ma: codeOf(constraint, message),
      });
    }
    result.push(...flattenValidationErrors(error.children ?? [], path));
  }
  // Mỗi cặp (trường, mã) chỉ báo một lần
  const seen = new Set<string>();
  return result.filter((item) => {
    const key = `${item.truong}\u0000${item.ma}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Dùng làm `exceptionFactory` của ValidationPipe toàn cục (app.setup.ts)
export function validationExceptionFactory(
  errors: ValidationError[],
): AppException {
  return new AppException(400, COMMON_ERROR_CODES.INVALID_DATA, {
    thongBao: INVALID_DATA_MESSAGE,
    loi: flattenValidationErrors(errors),
  });
}
