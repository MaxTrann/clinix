import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import { LoginDto } from './login.dto.js';

// Task A8 — thân của POST /auth/login. Mã test case: DN-22 (thiếu email/mật khẩu ⇒ 400), DN-04 (chuẩn hoá email), SE-04 (không echo giá trị).
// Mã LD-nn là [đề xuất]. Kiểm bằng ĐÚNG cấu hình ValidationPipe của configureApp.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const valid = {
  email: 'nguoi.dung@example.com',
  matKhau: 'Mat-Khau-Dang-Nhap-9!',
};
const parse = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: LoginDto });

// Danh sách lỗi dạng "truong:ma", đã sắp xếp; rỗng nếu hợp lệ
async function errorsOf(body: unknown): Promise<string[]> {
  try {
    await parse(body);
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

describe('LoginDto', () => {
  it('LD-01 body hợp lệ qua kiểm, DTO có đúng hai trường', async () => {
    const dto = await parse(valid);
    expect(dto).toBeInstanceOf(LoginDto);
    expect(Object.keys(dto).sort()).toEqual(['email', 'matKhau']);
  });

  it('LD-02 (DN-04) email được chuẩn hoá như đăng ký (cắt khoảng trắng, tên miền hạ chữ thường, phần trước @ giữ nguyên); mật khẩu KHÔNG bị trim', async () => {
    const dto = (await parse({
      email: '  Nguyen.Van@Example.COM ',
      matKhau: '  khoang trang 9!  ',
    })) as LoginDto;
    expect(dto.email).toBe('Nguyen.Van@example.com');
    expect(dto.matKhau).toBe('  khoang trang 9!  ');
  });

  it('LD-03 (DN-22) thiếu từng trường: đúng mã của trường đó', async () => {
    expect(await errorsOf({ matKhau: valid.matKhau })).toEqual([
      'email:EMAIL_KHONG_HOP_LE',
    ]);
    expect(await errorsOf({ email: valid.email })).toEqual([
      'matKhau:MAT_KHAU_KHONG_HOP_LE',
    ]);
    expect(await errorsOf({})).toEqual([
      'email:EMAIL_KHONG_HOP_LE',
      'matKhau:MAT_KHAU_KHONG_HOP_LE',
    ]);
  });

  it.each([
    ['rỗng', ''],
    ['số', 123456789],
    ['null', null],
    ['mảng', ['Mat-Khau-9!']],
    ['đối tượng', { a: 1 }],
    ['quá 64 ký tự', 'a1!'.repeat(22)],
  ])(
    'LD-04 (DN-22) mật khẩu %s: 400 MAT_KHAU_KHONG_HOP_LE, không chạm DB',
    async (_ten, matKhau) => {
      expect(await errorsOf({ ...valid, matKhau })).toEqual([
        'matKhau:MAT_KHAU_KHONG_HOP_LE',
      ]);
    },
  );

  it('LD-05 biên độ dài: 1 và 64 ký tự qua; 65 bị chặn (không phải lá chắn DoS, chỉ khớp chính sách mật khẩu)', async () => {
    expect(await errorsOf({ ...valid, matKhau: 'a' })).toEqual([]);
    expect(await errorsOf({ ...valid, matKhau: 'a'.repeat(64) })).toEqual([]);
    expect(await errorsOf({ ...valid, matKhau: 'a'.repeat(65) })).toEqual([
      'matKhau:MAT_KHAU_KHONG_HOP_LE',
    ]);
  });

  it.each([
    ['yếu (không có chữ số, không ký tự đặc biệt)', 'matkhauyeu'],
    ['ngắn 3 ký tự', 'ab1'],
    ['có ký tự ngoài ASCII', 'Mậtkhẩu-9!'],
    ['có emoji', 'Mat-Khau-9!😀'],
    ['có tab', 'Mat\tKhau-9!'],
  ])(
    'LD-06 mật khẩu %s KHÔNG bị chặn ở biên (không phải chính sách đặt mật khẩu): đi hết luồng như mật khẩu sai để được đếm',
    async (_ten, matKhau) => {
      expect(await errorsOf({ ...valid, matKhau })).toEqual([]);
    },
  );

  it.each([
    ['rỗng', ''],
    ['thiếu @', 'khong-co-a-cong.example.com'],
    ['có ký tự ngoài ASCII', 'nguoi.dùng@example.com'],
    ['không phải chuỗi', 12345],
  ])('LD-07 email %s: 400 EMAIL_KHONG_HOP_LE', async (_ten, email) => {
    expect(await errorsOf({ ...valid, email })).toEqual([
      'email:EMAIL_KHONG_HOP_LE',
    ]);
  });

  it('LD-08 trường lạ bị từ chối (client không gửi được loaiTaiKhoan, trangThai, xacNhan…)', async () => {
    expect(await errorsOf({ ...valid, xacNhan: valid.matKhau })).toEqual([
      'xacNhan:TRUONG_KHONG_DUOC_PHEP',
    ]);
    expect(await errorsOf({ ...valid, loaiTaiKhoan: 'QuanTriVien' })).toEqual([
      'loaiTaiKhoan:TRUONG_KHONG_DUOC_PHEP',
    ]);
  });

  it('LD-09 (SE-04) lỗi không echo giá trị người dùng gõ (mật khẩu, email)', async () => {
    const secret = 'Mat-Khau-Bi-Mat-Khong-Duoc-Lo-' + 'x'.repeat(40);
    const error: unknown = await parse({
      email: 'khong-hop-le',
      matKhau: secret,
    }).then(
      () => undefined,
      (rejected: unknown) => rejected,
    );

    expect(error).toBeInstanceOf(AppException);
    const text = JSON.stringify((error as AppException).getResponse());
    expect(text).not.toContain('Mat-Khau-Bi-Mat');
    expect(text).not.toContain('khong-hop-le');
  });
});
