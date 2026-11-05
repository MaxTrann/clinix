// Decorator cho trường hồ sơ trong DTO của patient (B2 PUT /profile, B3 và B4 hồ sơ người thân). Theo nếp auth/dto/account-field.decorators.ts:
// `message` là MÃ lỗi; Transform chuẩn hoá chạy lúc chuyển body thành DTO (ValidationPipe có transform: true), trước bước kiểm;
// giá trị không phải chuỗi được giữ nguyên để bước kiểm báo đúng mã của trường đó. Ba kiểu trường: TRACKING patient P1-D.
import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, ValidateBy } from 'class-validator';
import { IsAccountPhone } from '../../auth/dto/account-field.decorators.js';
import { trimAsciiWhitespace } from '../../auth/validation/ascii-text.js';
import { todayVN } from '../../common/time/time.js';
import { PATIENT_FIELD_ERROR_CODES } from '../patient.constants.js';
import { isValidAddress, normalizeAddress } from './address-policy.js';
import { isValidBirthDate } from './birth-date-policy.js';
import { isGender } from './gender-policy.js';
import { isRelationship } from './relationship.js';

export interface NullableFieldOptions {
  // true: trường phải có khoá nhưng được gửi `null` (xoá giá trị ở hồ sơ bản thân). Mặc định false: `null` cũng là lỗi
  nullable?: boolean;
}

// Một ràng buộc có mã. `nullable` nằm ngay trong ràng buộc, không dùng ValidateIf: ValidateIf đứng một mình vẫn được whitelist
// coi là "có decorator" nên trường lọt qua mà không bị kiểm (TRACKING patient P1-D). Thiếu khoá (undefined) luôn là lỗi.
function fieldRule(
  name: string,
  code: string,
  accept: (value: unknown) => boolean,
  nullable: boolean,
): PropertyDecorator {
  return ValidateBy({
    name,
    validator: {
      validate: (value: unknown) =>
        (nullable && value === null) || accept(value),
      defaultMessage: () => code,
    },
  });
}

// Ngày sinh (Q7). `todayVN()` tính lúc kiểm, không phải lúc nạp module: qua nửa đêm giờ Việt Nam thì "hôm nay" đổi theo
export function IsBirthDate({
  nullable = false,
}: NullableFieldOptions = {}): PropertyDecorator {
  return fieldRule(
    'isBirthDate',
    PATIENT_FIELD_ERROR_CODES.INVALID_BIRTH_DATE,
    (value) => typeof value === 'string' && isValidBirthDate(value, todayVN()),
    nullable,
  );
}

// Giới tính (Q3)
export function IsGender({
  nullable = false,
}: NullableFieldOptions = {}): PropertyDecorator {
  return fieldRule(
    'isGender',
    PATIENT_FIELD_ERROR_CODES.INVALID_GENDER,
    isGender,
    nullable,
  );
}

// Mối quan hệ (Q15): luôn bắt buộc, không null
export function IsRelationship(): PropertyDecorator {
  return fieldRule(
    'isRelationship',
    PATIENT_FIELD_ERROR_CODES.INVALID_RELATIONSHIP,
    isRelationship,
    false,
  );
}

// Địa chỉ (Q8, chỉ hồ sơ bản thân): khoá bắt buộc, được `null`; chuỗi rỗng hoặc chỉ có khoảng trắng ASCII thành `null` (lưu NULL)
export function IsAddress(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? normalizeAddress(value) : value,
    ),
    fieldRule(
      'isAddress',
      PATIENT_FIELD_ERROR_CODES.INVALID_ADDRESS,
      (value) => typeof value === 'string' && isValidAddress(value),
      true,
    ),
  );
}

// SĐT tuỳ chọn (người thân): thiếu khoá, `null`, chuỗi rỗng hoặc chỉ có khoảng trắng ASCII ⇒ không kiểm. Thiếu khoá để lại `undefined`,
// nơi lưu ghi `?? null`; còn lại thành `null`. Có giá trị ⇒ qua IsAccountPhone của auth (lưu 10 số liền, mã SDT_KHONG_HOP_LE).
export function IsOptionalPhone(): PropertyDecorator {
  return applyDecorators(
    IsOptional(),
    IsAccountPhone(),
    // class-transformer chạy các Transform NGƯỢC thứ tự đăng ký: Transform này đăng ký sau nên chạy trước Transform chuẩn hoá của IsAccountPhone
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' && trimAsciiWhitespace(value) === ''
        ? null
        : value,
    ),
  );
}
