import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import { ChangePasswordDto } from './change-password.dto.js';

// Task A13 — biên của POST /auth/change-password. Test case: DM-04 (mật khẩu mới không đạt Q11 hoặc không khớp ⇒ 400 ở BIÊN, dịch vụ không chạy), DM-06 (thân mang dữ liệu
// tài khoản ⇒ 400). Mã DMU-Dnn là [đề xuất]. Cấu hình ValidationPipe = configureApp.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const PASSWORD = 'Mat-Khau-Moi-8!';
const valid = {
  matKhauCu: 'Mat-Khau-Cu-7!',
  matKhauMoi: PASSWORD,
  xacNhan: PASSWORD,
};

const parse = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: ChangePasswordDto });

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

describe('ChangePasswordDto — hợp lệ', () => {
  it('DMU-D01 đúng ba trường qua kiểm, giá trị giữ NGUYÊN (không trim)', async () => {
    const body = {
      matKhauCu: ' cu ',
      matKhauMoi: ' Mat khau 9! ',
      xacNhan: ' Mat khau 9! ',
    };
    const dto = await parse(body);
    expect(dto).toBeInstanceOf(ChangePasswordDto);
    expect({ ...dto }).toEqual(body);
  });

  it('DMU-D02 mật khẩu cũ yếu hơn chính sách hiện hành vẫn qua biên: 1 ký tự và 64 ký tự', async () => {
    for (const matKhauCu of ['x', 'y'.repeat(64)]) {
      expect(await errorsOf({ ...valid, matKhauCu })).toEqual([]);
    }
  });

  it('DMU-D03 mật khẩu mới được trùng mật khẩu cũ', async () => {
    expect(await errorsOf({ ...valid, matKhauCu: PASSWORD })).toEqual([]);
  });
});

it('DMU-D11 mật khẩu cũ ngoài ASCII vẫn qua biên: chỉ dịch vụ mới biết đúng sai', async () => {
  expect(await errorsOf({ ...valid, matKhauCu: 'Mật-khẩu-cũ' })).toEqual([]);
});

describe('mật khẩu cũ sai dạng', () => {
  it.each([
    ['thiếu', undefined],
    ['rỗng', ''],
    ['65 ký tự', 'x'.repeat(65)],
    ['số JSON', 123],
    ['null', null],
    ['mảng', ['a']],
  ])(
    'DMU-D04 %s ⇒ matKhauCu:MAT_KHAU_KHONG_HOP_LE',
    async (_label, matKhauCu) => {
      expect(await errorsOf({ ...valid, matKhauCu })).toEqual([
        'matKhauCu:MAT_KHAU_KHONG_HOP_LE',
      ]);
    },
  );
});

describe('mật khẩu mới (Q11, N10) và xác nhận — DM-04', () => {
  it.each([
    ['7 ký tự', 'Ab1!xyz', 'MAT_KHAU_KHONG_HOP_LE'],
    ['65 ký tự', `1!${'a'.repeat(63)}`, 'MAT_KHAU_KHONG_HOP_LE'],
    ['không có chữ số', 'Matkhau-moi!', 'MAT_KHAU_KHONG_HOP_LE'],
    ['không có ký tự đặc biệt', 'Matkhaumoi8', 'MAT_KHAU_KHONG_HOP_LE'],
    ['có chữ tiếng Việt', 'Mật-khẩu-8!', 'MAT_KHAU_KY_TU_KHONG_HOP_LE'],
  ])('DMU-D05 %s ⇒ matKhauMoi:%s', async (_label, matKhauMoi, code) => {
    expect(
      await errorsOf({ ...valid, matKhauMoi, xacNhan: matKhauMoi }),
    ).toEqual([`matKhauMoi:${code}`]);
  });

  it('DMU-D06 biên 8 và 64 ký tự qua', async () => {
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
  ])('DMU-D07 xác nhận %s ⇒ XAC_NHAN_KHONG_KHOP', async (_label, xacNhan) => {
    expect(await errorsOf({ ...valid, xacNhan })).toEqual([
      'xacNhan:XAC_NHAN_KHONG_KHOP',
    ]);
  });

  it('DMU-D08 body rỗng báo đủ cả ba trường', async () => {
    expect(await errorsOf({})).toEqual([
      'matKhauCu:MAT_KHAU_KHONG_HOP_LE',
      'matKhauMoi:MAT_KHAU_KHONG_HOP_LE',
      'xacNhan:XAC_NHAN_KHONG_KHOP',
    ]);
  });
});

describe('trường lạ — DM-06', () => {
  it.each([
    ['taiKhoanId', '1'],
    ['tai_khoan_id', '1'],
    ['email', 'b@example.com'],
    ['sessionId', '42'],
  ])('DMU-D09 %s ⇒ TRUONG_KHONG_DUOC_PHEP', async (field, value) => {
    expect(await errorsOf({ ...valid, [field]: value })).toEqual([
      `${field}:TRUONG_KHONG_DUOC_PHEP`,
    ]);
  });
});

it('DMU-D10 lỗi kiểm dữ liệu KHÔNG echo mật khẩu đã gửi', async () => {
  let thrown: unknown;
  try {
    await parse({
      matKhauCu: 'mat-khau-cu-ne'.repeat(9),
      matKhauMoi: 'yeu-qua-ne',
      xacNhan: 'khac-han-ne',
    });
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(AppException);
  const text = JSON.stringify((thrown as AppException).getResponse());
  for (const secret of ['mat-khau-cu-ne', 'yeu-qua-ne', 'khac-han-ne']) {
    expect(text).not.toContain(secret);
  }
});
