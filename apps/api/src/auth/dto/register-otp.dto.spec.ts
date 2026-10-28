import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import {
  ResendRegisterOtpDto,
  VerifyRegisterOtpDto,
} from './register-otp.dto.js';

// Task A6. Test case (mã XM-nn là [đề xuất]): XM-01 mã lần gửi, XM-02 mã OTP, XM-03 email và trường lạ, XM-04 không echo giá trị.
// Kiểm bằng ĐÚNG cấu hình ValidationPipe của configureApp, như register.dto.spec.ts của A5.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const validVerify = {
  email: 'nguoi.dung@example.com',
  maXacThucId: '42',
  otp: '012345',
};
const validResend = { email: 'nguoi.dung@example.com', maXacThucId: '42' };

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
const verifyErrors = (body: unknown) => errorsOf(VerifyRegisterOtpDto, body);
const resendErrors = (body: unknown) => errorsOf(ResendRegisterOtpDto, body);

describe('VerifyRegisterOtpDto / ResendRegisterOtpDto — dữ liệu hợp lệ', () => {
  it('XM-01 body hợp lệ qua kiểm; verify có đủ ba trường, resend có đúng hai', async () => {
    const verify = await parseWith(VerifyRegisterOtpDto, validVerify);
    expect(verify).toBeInstanceOf(VerifyRegisterOtpDto);
    expect(Object.keys(verify).sort()).toEqual(['email', 'maXacThucId', 'otp']);
    const resend = await parseWith(ResendRegisterOtpDto, validResend);
    expect(Object.keys(resend).sort()).toEqual(['email', 'maXacThucId']);
  });

  it('XM-03 email được chuẩn hoá như đăng ký (cắt khoảng trắng, tên miền hạ chữ thường); otp và mã lần gửi giữ nguyên', async () => {
    const dto = (await parseWith(VerifyRegisterOtpDto, {
      ...validVerify,
      email: '  Nguyen.Van@Example.COM ',
    })) as VerifyRegisterOtpDto;
    expect(dto.email).toBe('Nguyen.Van@example.com');
    expect(dto.maXacThucId).toBe('42');
    expect(dto.otp).toBe('012345');
  });
});

describe('maXacThucId (XM-01) — chuỗi số nguyên dương trong khoảng BIGINT, không chuẩn hoá', () => {
  it.each(['1', '42', '9007199254740993', '9223372036854775807'])(
    'chấp nhận %s',
    async (maXacThucId) => {
      expect(await verifyErrors({ ...validVerify, maXacThucId })).toEqual([]);
      expect(await resendErrors({ ...validResend, maXacThucId })).toEqual([]);
    },
  );

  it.each([
    ['rỗng', ''],
    ['số 0', '0'],
    ['số 0 đứng đầu', '01'],
    ['số âm', '-1'],
    ['có dấu cộng', '+1'],
    ['số thập phân', '1.5'],
    ['dạng khoa học', '1e3'],
    ['khoảng trắng đầu', ' 1'],
    ['khoảng trắng cuối', '1 '],
    ['xuống dòng cuối', '1\n'],
    ['chữ số Ả Rập mở rộng', '١٢٣'],
    ['chữ cái', 'abc'],
    ['vượt BIGINT một đơn vị', '9223372036854775808'],
    ['20 chữ số', '10000000000000000000'],
    ['số JSON', 42],
    // Number('…'): chính số này khi parse từ JSON cũng mất chính xác (thành …992), nên phải bị từ chối chứ không được "đoán" thành id khác
    ['số JSON lớn mất chính xác', Number('9007199254740993')],
    ['null', null],
    ['mảng', ['1']],
    ['đối tượng', { id: '1' }],
  ])(
    'XM-01 %s → MA_XAC_THUC_KHONG_HOP_LE ở trường maXacThucId (cả verify lẫn resend)',
    async (_label, maXacThucId) => {
      expect(await verifyErrors({ ...validVerify, maXacThucId })).toEqual([
        'maXacThucId:MA_XAC_THUC_KHONG_HOP_LE',
      ]);
      expect(await resendErrors({ ...validResend, maXacThucId })).toEqual([
        'maXacThucId:MA_XAC_THUC_KHONG_HOP_LE',
      ]);
    },
  );
});

describe('otp (XM-02) — chuỗi đúng 6 chữ số ASCII, không chuẩn hoá', () => {
  it.each(['000000', '012345', '999999'])('chấp nhận %s', async (otp) => {
    expect(await verifyErrors({ ...validVerify, otp })).toEqual([]);
  });

  it.each([
    ['rỗng', ''],
    ['5 chữ số', '12345'],
    ['7 chữ số', '1234567'],
    ['khoảng trắng đầu', ' 123456'],
    ['khoảng trắng cuối', '123456 '],
    ['xuống dòng cuối', '123456\n'],
    ['có chữ', '12345a'],
    ['có dấu gạch', '123-456'],
    ['chữ số toàn góc', '１２３４５６'],
    ['chữ số Ả Rập mở rộng', '١٢٣٤٥٦'],
    ['số JSON (mất số 0 đứng đầu)', 123456],
    ['null', null],
    ['mảng', ['123456']],
  ])('XM-02 %s → OTP_KHONG_HOP_LE ở trường otp', async (_label, otp) => {
    expect(await verifyErrors({ ...validVerify, otp })).toEqual([
      'otp:OTP_KHONG_HOP_LE',
    ]);
  });
});

describe('thiếu trường, nhiều lỗi và trường lạ (XM-03)', () => {
  it('XM-03 thiếu từng trường → báo đúng trường đó', async () => {
    expect(await verifyErrors({ ...validVerify, email: undefined })).toEqual([
      'email:EMAIL_KHONG_HOP_LE',
    ]);
    expect(
      await verifyErrors({ ...validVerify, maXacThucId: undefined }),
    ).toEqual(['maXacThucId:MA_XAC_THUC_KHONG_HOP_LE']);
    expect(await verifyErrors({ ...validVerify, otp: undefined })).toEqual([
      'otp:OTP_KHONG_HOP_LE',
    ]);
  });

  it('XM-03 body rỗng → đủ lỗi cho cả ba trường (verify) / hai trường (resend)', async () => {
    expect(await verifyErrors({})).toEqual([
      'email:EMAIL_KHONG_HOP_LE',
      'maXacThucId:MA_XAC_THUC_KHONG_HOP_LE',
      'otp:OTP_KHONG_HOP_LE',
    ]);
    expect(await resendErrors({})).toEqual([
      'email:EMAIL_KHONG_HOP_LE',
      'maXacThucId:MA_XAC_THUC_KHONG_HOP_LE',
    ]);
  });

  it('XM-03 mọi trường cùng sai → trả đủ danh sách một lần', async () => {
    expect(
      await verifyErrors({ email: 'sai', maXacThucId: '0', otp: '1' }),
    ).toEqual([
      'email:EMAIL_KHONG_HOP_LE',
      'maXacThucId:MA_XAC_THUC_KHONG_HOP_LE',
      'otp:OTP_KHONG_HOP_LE',
    ]);
  });

  it.each([
    ['taiKhoanId', '1'],
    ['loai', 'QuenMatKhau'],
    ['daXacMinhEmail', true],
    ['matKhau', 'Matkhau1!'],
  ])(
    'XM-03 trường lạ %s bị từ chối TRUONG_KHONG_DUOC_PHEP (cả hai endpoint)',
    async (field, value) => {
      expect(await verifyErrors({ ...validVerify, [field]: value })).toEqual([
        `${field}:TRUONG_KHONG_DUOC_PHEP`,
      ]);
      expect(await resendErrors({ ...validResend, [field]: value })).toEqual([
        `${field}:TRUONG_KHONG_DUOC_PHEP`,
      ]);
    },
  );

  it('XM-03 resend KHÔNG nhận trường otp (verify mới nhận)', async () => {
    expect(await resendErrors({ ...validResend, otp: '123456' })).toEqual([
      'otp:TRUONG_KHONG_DUOC_PHEP',
    ]);
  });
});

describe('XM-04 lỗi kiểm dữ liệu KHÔNG chứa giá trị người dùng gửi', () => {
  it('không echo OTP, mã lần gửi hay email sai vào phản hồi', async () => {
    let thrown: unknown;
    try {
      await parseWith(VerifyRegisterOtpDto, {
        email: 'khong-phai-email',
        maXacThucId: '987654321x',
        otp: '77777x',
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AppException);
    const text = JSON.stringify((thrown as AppException).getResponse());
    for (const secret of ['khong-phai-email', '987654321x', '77777x']) {
      expect(text).not.toContain(secret);
    }
  });
});
