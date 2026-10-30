import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import {
  ForgotPasswordDto,
  VerifyForgotPasswordOtpDto,
} from './forgot-password.dto.js';

// Task A11. Test case: QM-01 (dữ liệu vào), A1 của QMK (email), A2/A3 (mã OTP). Mã FD-nn là [đề xuất].
// Kiểm bằng ĐÚNG cấu hình ValidationPipe của configureApp, như register-otp.dto.spec.ts của A6.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const validForgot = { email: 'nguoi.dung@example.com' };
const validVerify = { ...validForgot, otp: '012345' };

const parseWith = (metatype: new () => object, body: unknown) =>
  pipe.transform(body, { type: 'body', metatype });

// Danh sách lỗi dạng "truong:ma", đã sắp xếp; rỗng nếu hợp lệ
async function errorsOf(
  metatype: new () => object,
  body: unknown,
): Promise<string[]> {
  try {
    await parseWith(metatype, body);
    return [];
  } catch (error) {
    if (!(error instanceof AppException)) throw error;
    expect(error.getStatus()).toBe(400);
    expect(error.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    const response = error.getResponse() as {
      loi: { truong: string; ma: string }[];
    };
    return response.loi.map((item) => `${item.truong}:${item.ma}`).sort();
  }
}
const forgotErrors = (body: unknown) => errorsOf(ForgotPasswordDto, body);
const verifyErrors = (body: unknown) =>
  errorsOf(VerifyForgotPasswordOtpDto, body);

describe('ForgotPasswordDto / VerifyForgotPasswordOtpDto — dữ liệu hợp lệ', () => {
  it('FD-01 body hợp lệ qua kiểm; forgot/resend có đúng một trường, verify có đúng hai', async () => {
    const forgot = await parseWith(ForgotPasswordDto, validForgot);
    expect(forgot).toBeInstanceOf(ForgotPasswordDto);
    expect(Object.keys(forgot)).toEqual(['email']);
    const verify = await parseWith(VerifyForgotPasswordOtpDto, validVerify);
    expect(verify).toBeInstanceOf(VerifyForgotPasswordOtpDto);
    expect(Object.keys(verify).sort()).toEqual(['email', 'otp']);
  });

  it('FD-02 email được chuẩn hoá như đăng ký (cắt khoảng trắng, tên miền hạ chữ thường, phần trước @ giữ nguyên); otp giữ nguyên', async () => {
    const forgot = (await parseWith(ForgotPasswordDto, {
      email: '  Nguyen.Van@Example.COM ',
    })) as ForgotPasswordDto;
    expect(forgot.email).toBe('Nguyen.Van@example.com');
    const verify = (await parseWith(VerifyForgotPasswordOtpDto, {
      email: ' A.B@EXAMPLE.com',
      otp: '000000',
    })) as VerifyForgotPasswordOtpDto;
    expect(verify).toMatchObject({ email: 'A.B@example.com', otp: '000000' });
  });
});

describe('email — A1 của quên mật khẩu', () => {
  it.each([
    ['rỗng', ''],
    ['chỉ khoảng trắng', '   '],
    ['thiếu @', 'khong-phai-email'],
    ['thiếu tên miền', 'a@'],
    ['có dấu', 'nguyễn@example.com'],
    ['có khoảng trắng ở giữa', 'a b@example.com'],
    ['số JSON', 123],
    ['null', null],
    ['mảng', ['a@example.com']],
    ['đối tượng', { email: 'a@example.com' }],
  ])('FD-03 %s → EMAIL_KHONG_HOP_LE (cả hai DTO)', async (_label, email) => {
    expect(await forgotErrors({ email })).toEqual(['email:EMAIL_KHONG_HOP_LE']);
    expect(await verifyErrors({ ...validVerify, email })).toEqual([
      'email:EMAIL_KHONG_HOP_LE',
    ]);
  });
});

describe('otp — chuỗi đúng 6 chữ số ASCII, không chuẩn hoá (A2, A3 của QMK)', () => {
  it.each(['000000', '012345', '999999'])('FD-04 chấp nhận %s', async (otp) => {
    expect(await verifyErrors({ ...validVerify, otp })).toEqual([]);
  });

  it.each([
    ['rỗng', ''],
    ['5 chữ số', '12345'],
    ['7 chữ số', '1234567'],
    ['khoảng trắng đầu', ' 123456'],
    ['xuống dòng cuối', '123456\n'],
    ['có chữ', '12345a'],
    ['chữ số toàn góc', '１２３４５６'],
    ['số JSON (mất số 0 đứng đầu)', 123456],
    ['null', null],
    ['mảng', ['123456']],
  ])('FD-04 %s → OTP_KHONG_HOP_LE', async (_label, otp) => {
    expect(await verifyErrors({ ...validVerify, otp })).toEqual([
      'otp:OTP_KHONG_HOP_LE',
    ]);
  });
});

describe('thiếu trường và trường lạ', () => {
  it('FD-05 thiếu trường → báo đúng trường đó; body rỗng báo đủ', async () => {
    expect(await forgotErrors({})).toEqual(['email:EMAIL_KHONG_HOP_LE']);
    expect(await verifyErrors({ email: validVerify.email })).toEqual([
      'otp:OTP_KHONG_HOP_LE',
    ]);
    expect(await verifyErrors({})).toEqual([
      'email:EMAIL_KHONG_HOP_LE',
      'otp:OTP_KHONG_HOP_LE',
    ]);
  });

  it.each([
    ['maXacThucId', '42'],
    ['taiKhoanId', '1'],
    ['loai', 'QuenMatKhau'],
    ['matKhauMoi', 'Matkhau1!'],
    ['resetToken', 'x.y.z'],
  ])(
    'FD-06 trường lạ %s bị từ chối TRUONG_KHONG_DUOC_PHEP (cả hai DTO): KHÔNG có maXacThucId trong thân (PLAN 5.1)',
    async (field, value) => {
      expect(await forgotErrors({ ...validForgot, [field]: value })).toEqual([
        `${field}:TRUONG_KHONG_DUOC_PHEP`,
      ]);
      expect(await verifyErrors({ ...validVerify, [field]: value })).toEqual([
        `${field}:TRUONG_KHONG_DUOC_PHEP`,
      ]);
    },
  );

  it('FD-07 forgot/resend KHÔNG nhận trường otp (verify mới nhận)', async () => {
    expect(await forgotErrors({ ...validForgot, otp: '123456' })).toEqual([
      'otp:TRUONG_KHONG_DUOC_PHEP',
    ]);
  });
});

describe('FD-08 lỗi kiểm dữ liệu KHÔNG chứa giá trị người dùng gửi', () => {
  it('không echo OTP hay email sai vào phản hồi', async () => {
    let thrown: unknown;
    try {
      await parseWith(VerifyForgotPasswordOtpDto, {
        email: 'khong-phai-email',
        otp: '77777x',
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AppException);
    const text = JSON.stringify((thrown as AppException).getResponse());
    for (const secret of ['khong-phai-email', '77777x']) {
      expect(text).not.toContain(secret);
    }
  });
});
