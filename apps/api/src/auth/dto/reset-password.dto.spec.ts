import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import { RESET_TOKEN_MAX_LENGTH } from '../auth.constants.js';
import { ResetPasswordDto } from './reset-password.dto.js';

// Task A12 — biên của POST /auth/reset-password. Test case: QM-08 (mật khẩu mới không đạt Q11 / không khớp ⇒ 400 ở BIÊN, dịch vụ không chạy nên token
// không bị tiêu thụ), QM-11 (không có token), QM-12 (thân không nhận dữ liệu tài khoản). Mã MKU-Dnn là [đề xuất]. Cấu hình ValidationPipe = configureApp.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const PASSWORD = 'Mat-Khau-Moi-8!';
const valid = {
  resetToken: 'aaa.bbb.ccc',
  matKhauMoi: PASSWORD,
  xacNhan: PASSWORD,
};

const parse = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: ResetPasswordDto });

// Danh sách lỗi dạng "truong:ma", đã sắp xếp; rỗng nếu hợp lệ
async function errorsOf(body: unknown): Promise<string[]> {
  try {
    await parse(body);
    return [];
  } catch (error) {
    if (!(error instanceof AppException)) throw error;
    expect(error.getStatus()).toBe(400);
    expect(error.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    const { loi } = error.getResponse() as {
      loi: { truong: string; ma: string }[];
    };
    return loi.map((item) => `${item.truong}:${item.ma}`).sort();
  }
}

describe('ResetPasswordDto — hợp lệ', () => {
  it('MKU-D01 đúng ba trường qua kiểm, giá trị giữ NGUYÊN (không trim token hay mật khẩu)', async () => {
    const body = {
      resetToken: ' x.y.z ',
      matKhauMoi: ' Mat khau 9! ',
      xacNhan: ' Mat khau 9! ',
    };
    const dto = await parse(body);
    expect(dto).toBeInstanceOf(ResetPasswordDto);
    expect({ ...dto }).toEqual(body);
  });

  it(`MKU-D02 biên độ dài resetToken: 1 và ${String(RESET_TOKEN_MAX_LENGTH)} ký tự qua`, async () => {
    expect(await errorsOf({ ...valid, resetToken: 'x' })).toEqual([]);
    expect(
      await errorsOf({
        ...valid,
        resetToken: 'x'.repeat(RESET_TOKEN_MAX_LENGTH),
      }),
    ).toEqual([]);
  });
});

describe('resetToken sai dạng ⇒ RESET_TOKEN_KHONG_HOP_LE (QM-11 "không có token")', () => {
  it.each([
    ['thiếu', undefined],
    ['rỗng', ''],
    [
      `${String(RESET_TOKEN_MAX_LENGTH + 1)} ký tự`,
      'x'.repeat(RESET_TOKEN_MAX_LENGTH + 1),
    ],
    ['số JSON', 123],
    ['null', null],
    ['mảng', ['a.b.c']],
    ['đối tượng', { token: 'a.b.c' }],
  ])('MKU-D03 %s', async (_label, resetToken) => {
    expect(await errorsOf({ ...valid, resetToken })).toEqual([
      'resetToken:RESET_TOKEN_KHONG_HOP_LE',
    ]);
  });
});

describe('mật khẩu mới (Q11, N10) và xác nhận — QM-08', () => {
  it.each([
    ['7 ký tự', 'Ab1!xyz', 'MAT_KHAU_KHONG_HOP_LE'],
    ['65 ký tự', `1!${'a'.repeat(63)}`, 'MAT_KHAU_KHONG_HOP_LE'],
    ['không có chữ số', 'Matkhau-moi!', 'MAT_KHAU_KHONG_HOP_LE'],
    ['không có ký tự đặc biệt', 'Matkhaumoi8', 'MAT_KHAU_KHONG_HOP_LE'],
    ['có chữ tiếng Việt', 'Mật-khẩu-8!', 'MAT_KHAU_KY_TU_KHONG_HOP_LE'],
  ])(
    'MKU-D04 %s ⇒ matKhauMoi:%s (xác nhận khớp nên chỉ một lỗi)',
    async (_label, matKhauMoi, code) => {
      expect(
        await errorsOf({ ...valid, matKhauMoi, xacNhan: matKhauMoi }),
      ).toEqual([`matKhauMoi:${code}`]);
    },
  );

  it('MKU-D05 biên 8 và 64 ký tự qua', async () => {
    for (const matKhauMoi of ['Abcde1!x', `1!${'a'.repeat(62)}`]) {
      expect(
        await errorsOf({ ...valid, matKhauMoi, xacNhan: matKhauMoi }),
      ).toEqual([]);
    }
  });

  it.each([
    ['khác một ký tự', `${PASSWORD}x`],
    ['khác hoa/thường', PASSWORD.toLowerCase()],
    ['thiếu', undefined],
    ['số JSON', 1],
  ])('MKU-D06 xác nhận %s ⇒ XAC_NHAN_KHONG_KHOP', async (_label, xacNhan) => {
    expect(await errorsOf({ ...valid, xacNhan })).toEqual([
      'xacNhan:XAC_NHAN_KHONG_KHOP',
    ]);
  });

  it('MKU-D07 nhiều trường sai cùng lúc báo đủ; body rỗng báo cả ba', async () => {
    expect(await errorsOf({})).toEqual([
      'matKhauMoi:MAT_KHAU_KHONG_HOP_LE',
      'resetToken:RESET_TOKEN_KHONG_HOP_LE',
      'xacNhan:XAC_NHAN_KHONG_KHOP',
    ]);
  });
});

describe('trường lạ — QM-12 (thân không mang dữ liệu tài khoản nào)', () => {
  it.each([
    ['taiKhoanId', '1'],
    ['email', 'b@example.com'],
    ['maXacThucId', '42'],
    ['matKhau', PASSWORD],
    ['otp', '123456'],
  ])('MKU-D08 %s ⇒ TRUONG_KHONG_DUOC_PHEP', async (field, value) => {
    expect(await errorsOf({ ...valid, [field]: value })).toEqual([
      `${field}:TRUONG_KHONG_DUOC_PHEP`,
    ]);
  });
});

it('MKU-D09 lỗi kiểm dữ liệu KHÔNG echo token hay mật khẩu đã gửi', async () => {
  let thrown: unknown;
  try {
    await parse({
      resetToken: 'tok'.repeat(200),
      matKhauMoi: 'yeu-qua-ne',
      xacNhan: 'khac-han-ne',
    });
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(AppException);
  const text = JSON.stringify((thrown as AppException).getResponse());
  for (const secret of ['toktok', 'yeu-qua-ne', 'khac-han-ne']) {
    expect(text).not.toContain(secret);
  }
});
