// Decorator cho hai trường của luồng xác minh OTP (task A6): mã lần gửi và mã OTP người dùng nhập.
// Sai định dạng bị chặn ở BIÊN (400 DU_LIEU_KHONG_HOP_LE, không chạm DB): nếu lọt xuống OtpService.verify thì một mã sai dạng vẫn bị tính
// là một lần nhập sai của hàng OTP đó, người ngoài lợi dụng được để đốt lượt.
import { ValidateBy, type ValidationOptions } from 'class-validator';
import { isOtpFormat } from '../otp/otp-code.js';
import { VALIDATION_CODES } from '../validation/validation-codes.js';

// ma_xac_thuc_id là BIGINT có dấu của MySQL; số tuần tự dương, không số 0 đứng đầu
const VERIFICATION_ID_FORMAT = /^[1-9][0-9]{0,18}$/;
const BIGINT_MAX = 9223372036854775807n;

/**
 * Mã lần gửi hợp lệ: CHUỖI số nguyên dương trong khoảng BIGINT. Cố ý KHÔNG nhận số JSON: số lớn hơn 2^53 mất chính xác khi parse
 * (id tuần tự 9007199254740993 sẽ thành ...992) nên có thể trỏ nhầm sang hàng của người khác. Không chuẩn hoá (không trim).
 */
export function isVerificationId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    VERIFICATION_ID_FORMAT.test(value) &&
    BigInt(value) <= BIGINT_MAX
  );
}

export function IsVerificationId(
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isVerificationId',
      validator: {
        validate: (value: unknown) => isVerificationId(value),
        defaultMessage: () => VALIDATION_CODES.INVALID_VERIFICATION_ID,
      },
    },
    options,
  );
}

/** Mã OTP hợp lệ: CHUỖI đúng 6 chữ số ASCII. Không nhận số JSON (mất số 0 đứng đầu) và không trim (khoảng trắng thừa là sai). */
export function IsOtpCode(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isOtpCode',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && isOtpFormat(value),
        // Thông điệp chỉ là mã lỗi, không bao giờ chèn giá trị người dùng gõ vào
        defaultMessage: () => VALIDATION_CODES.INVALID_OTP,
      },
    },
    options,
  );
}
