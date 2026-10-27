import { Type, plainToInstance } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsString,
  ValidateNested,
  validate,
  type ValidationError,
} from 'class-validator';
import {
  IsAccountEmail,
  IsAccountPassword,
} from '../../auth/dto/account-field.decorators.js';
import { VALIDATION_CODES } from '../../auth/validation/validation-codes.js';
import { AppException } from './app.exception.js';
import {
  flattenValidationErrors,
  validationExceptionFactory,
} from './validation-exception.js';

// Task P5. Lỗi kiểm dữ liệu → 400 DU_LIEU_KHONG_HOP_LE kèm loi[{truong, ma}] (plan admin 5.9; A1-C). Dùng class-validator thật.
class LineDto {
  @IsString()
  name!: string;

  @IsInt()
  qty!: number;
}

class AddressDto {
  @IsString()
  city!: string;
}

class RegisterDto {
  @IsAccountEmail()
  email!: string;

  @IsAccountPassword()
  matKhau!: string;

  @IsString()
  hoTen!: string;

  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineDto)
  lines!: LineDto[];
}

// Chạy kiểm giống ValidationPipe toàn cục; `leaky` = để class-validator gắn cả target/value như mặc định của nó
async function errorsOf(
  input: Record<string, unknown>,
  leaky = false,
): Promise<ValidationError[]> {
  return validate(plainToInstance(RegisterDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
    ...(leaky ? {} : { validationError: { target: false, value: false } }),
  });
}

const VALID = {
  email: 'nguoi.dung@example.com',
  matKhau: 'Mat-khau-thu-1!',
  hoTen: 'Nguyễn Văn A',
  address: { city: 'TP HCM' },
  lines: [{ name: 'Khám tổng quát', qty: 1 }],
};

describe('flattenValidationErrors', () => {
  it('dữ liệu hợp lệ ⇒ không có lỗi', async () => {
    expect(flattenValidationErrors(await errorsOf(VALID))).toEqual([]);
  });

  it('mã của DTO dự án (A1) đi nguyên ra ma: email, mật khẩu', async () => {
    const result = flattenValidationErrors(
      await errorsOf({ ...VALID, email: 'khong-phai-email', matKhau: 'abc' }),
    );

    expect(result).toEqual(
      expect.arrayContaining([
        { truong: 'email', ma: VALIDATION_CODES.INVALID_EMAIL },
        { truong: 'matKhau', ma: VALIDATION_CODES.INVALID_PASSWORD },
      ]),
    );
    expect(result).toHaveLength(2);
  });

  it('ràng buộc có sẵn của class-validator ⇒ tên ràng buộc SNAKE_CASE hoa', async () => {
    const result = flattenValidationErrors(
      await errorsOf({ ...VALID, hoTen: 42 }),
    );
    expect(result).toEqual([{ truong: 'hoTen', ma: 'IS_STRING' }]);
  });

  it('trường lạ (forbidNonWhitelisted) ⇒ TRUONG_KHONG_DUOC_PHEP', async () => {
    const result = flattenValidationErrors(
      await errorsOf({ ...VALID, quyen: 'admin' }),
    );
    expect(result).toEqual([{ truong: 'quyen', ma: 'TRUONG_KHONG_DUOC_PHEP' }]);
  });

  it('trường thiếu ⇒ báo mã của chính trường đó (A1-C)', async () => {
    const { email: _email, ...withoutEmail } = VALID;
    const result = flattenValidationErrors(await errorsOf(withoutEmail));
    expect(result).toEqual([
      { truong: 'email', ma: VALIDATION_CODES.INVALID_EMAIL },
    ]);
  });

  it('đối tượng lồng và phần tử mảng ⇒ đường dẫn có dấu chấm', async () => {
    const result = flattenValidationErrors(
      await errorsOf({
        ...VALID,
        address: { city: 1 },
        lines: [
          { name: 'ok', qty: 1 },
          { name: 2, qty: 'x' },
        ],
      }),
    );

    expect(result).toEqual(
      expect.arrayContaining([
        { truong: 'address.city', ma: 'IS_STRING' },
        { truong: 'lines.1.name', ma: 'IS_STRING' },
        { truong: 'lines.1.qty', ma: 'IS_INT' },
      ]),
    );
    expect(result).toHaveLength(3);
  });

  it('KHÔNG đọc value/target: kể cả khi class-validator gắn mật khẩu người dùng vào lỗi, đầu ra không có nó', async () => {
    const leaky = await errorsOf(
      { ...VALID, matKhau: 'mat-khau-sai-nhay-cam', hoTen: 7 },
      true,
    );
    // Đối chứng: lỗi thô THẬT SỰ mang mật khẩu (nếu không thì phép thử này vô nghĩa)
    expect(JSON.stringify(leaky)).toContain('mat-khau-sai-nhay-cam');

    const result = flattenValidationErrors(leaky);

    expect(JSON.stringify(result)).not.toContain('mat-khau-sai-nhay-cam');
  });

  it('mỗi cặp (trường, mã) chỉ báo một lần', () => {
    const errors = [
      { property: 'a', constraints: { isString: 'x' } },
      { property: 'a', constraints: { isString: 'y' } },
    ] as ValidationError[];
    expect(flattenValidationErrors(errors)).toEqual([
      { truong: 'a', ma: 'IS_STRING' },
    ]);
  });

  it('tên trường do client gửi (trường lạ) bị cắt ở 100 ký tự và lỗi gốc không có property thì dùng "body"', () => {
    const errors = [
      { property: 'x'.repeat(500), constraints: { whitelistValidation: 'm' } },
      { property: '', constraints: { isObject: 'm' } },
    ] as ValidationError[];

    const result = flattenValidationErrors(errors);

    expect(result[0]?.truong).toHaveLength(100);
    expect(result[1]).toEqual({ truong: 'body', ma: 'IS_OBJECT' });
  });
});

describe('validationExceptionFactory', () => {
  it('trả AppException 400 DU_LIEU_KHONG_HOP_LE kèm loi và thongBao chung', async () => {
    const exception = validationExceptionFactory(
      await errorsOf({ ...VALID, email: 'x' }),
    );

    expect(exception).toBeInstanceOf(AppException);
    expect(exception.getStatus()).toBe(400);
    expect(exception.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    expect(exception.getResponse()).toEqual({
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      thongBao: 'Dữ liệu không hợp lệ.',
      loi: [{ truong: 'email', ma: VALIDATION_CODES.INVALID_EMAIL }],
    });
  });
});
