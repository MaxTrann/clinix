import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import { RegisterDto } from './register.dto.js';

// Task A5. Test case: DK-04, DK-05, DK-06, DK-07, DK-08, DK-09 ở mức DTO (kiểm bằng ĐÚNG cấu hình ValidationPipe của configureApp);
// quy tắc từng trường đã có test riêng ở A1 (account-field.decorators.spec.ts) và ở full-name-policy.spec.ts.

// Cùng tuỳ chọn với configureApp() trong app.setup.ts
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const validBody = {
  hoTen: 'Nguyễn Văn A',
  email: 'nguoi.dung@example.com',
  soDienThoai: '0901234567',
  matKhau: 'Matkhau1!',
  xacNhan: 'Matkhau1!',
};

const parse = (body: unknown) =>
  pipe.transform(body, {
    type: 'body',
    metatype: RegisterDto,
  }) as Promise<RegisterDto>;

// Danh sách lỗi dạng "truong:ma", đã sắp xếp
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

describe('RegisterDto — dữ liệu hợp lệ', () => {
  it('(DK-01) body hợp lệ qua kiểm và có đủ năm trường', async () => {
    const dto = await parse(validBody);
    expect(dto).toBeInstanceOf(RegisterDto);
    expect(Object.keys(dto).sort()).toEqual([
      'email',
      'hoTen',
      'matKhau',
      'soDienThoai',
      'xacNhan',
    ]);
  });

  it('(DK-05, DK-17) chuẩn hoá: email hạ chữ tên miền và cắt khoảng trắng, SĐT thành 10 số liền, họ tên NFC; mật khẩu giữ nguyên (không trim)', async () => {
    const dto = await parse({
      hoTen: ` Nguye${String.fromCodePoint(0x0302, 0x0303)}n Van A `,
      email: '  Nguyen.Van@Example.COM ',
      soDienThoai: '0901 234 567',
      matKhau: ' Matkhau1! ',
      xacNhan: ' Matkhau1! ',
    });
    expect(dto.hoTen).toBe(`Nguy${String.fromCodePoint(0x1ec5)}n Van A`);
    expect(dto.email).toBe('Nguyen.Van@example.com'); // phần trước @ giữ nguyên
    expect(dto.soDienThoai).toBe('0901234567');
    expect(dto.matKhau).toBe(' Matkhau1! ');
    expect(dto.xacNhan).toBe(' Matkhau1! ');
  });
});

describe('RegisterDto — từng trường sai', () => {
  it.each([
    ['không phải email', 'khong-phai-email'],
    ['rỗng', ''],
    ['dài hơn 255 ký tự', `${'a'.repeat(250)}@example.com`],
    ['có ký tự không ASCII', 'nguyên@example.com'],
  ])('(DK-04) email %s → EMAIL_KHONG_HOP_LE', async (_label, email) => {
    expect(await errorsOf({ ...validBody, email })).toEqual([
      'email:EMAIL_KHONG_HOP_LE',
    ]);
  });

  it.each([
    ['9 chữ số', '090123456'],
    ['không bắt đầu bằng 0', '1901234567'],
    ['có chữ', '09012345ab'],
    ['rỗng', ''],
  ])('(DK-05) SĐT %s → SDT_KHONG_HOP_LE', async (_label, soDienThoai) => {
    expect(await errorsOf({ ...validBody, soDienThoai })).toEqual([
      'soDienThoai:SDT_KHONG_HOP_LE',
    ]);
  });

  it.each([
    ['7 ký tự', 'Abcde1!', 'MAT_KHAU_KHONG_HOP_LE'],
    ['65 ký tự', `${'a'.repeat(63)}1!`, 'MAT_KHAU_KHONG_HOP_LE'],
    ['thiếu chữ số', 'Matkhau!!', 'MAT_KHAU_KHONG_HOP_LE'],
    ['thiếu ký tự đặc biệt', 'Matkhau12', 'MAT_KHAU_KHONG_HOP_LE'],
    ['có chữ có dấu', 'Mậtkhẩu1!', 'MAT_KHAU_KY_TU_KHONG_HOP_LE'],
  ])('(DK-06) mật khẩu %s → %s', async (_label, matKhau, code) => {
    expect(await errorsOf({ ...validBody, matKhau, xacNhan: matKhau })).toEqual(
      [`matKhau:${code}`],
    );
  });

  it('(DK-07) xác nhận không khớp → XAC_NHAN_KHONG_KHOP ở trường xacNhan', async () => {
    expect(await errorsOf({ ...validBody, xacNhan: 'Matkhau2!' })).toEqual([
      'xacNhan:XAC_NHAN_KHONG_KHOP',
    ]);
  });

  it('(HT-11) họ tên toàn dấu cách → HO_TEN_KHONG_HOP_LE ở trường hoTen', async () => {
    expect(await errorsOf({ ...validBody, hoTen: '     ' })).toEqual([
      'hoTen:HO_TEN_KHONG_HOP_LE',
    ]);
  });
});

describe('RegisterDto — thiếu và nhiều lỗi cùng lúc', () => {
  it.each([
    ['hoTen', 'HO_TEN_KHONG_HOP_LE'],
    ['email', 'EMAIL_KHONG_HOP_LE'],
    ['soDienThoai', 'SDT_KHONG_HOP_LE'],
    ['matKhau', 'MAT_KHAU_KHONG_HOP_LE'],
    ['xacNhan', 'XAC_NHAN_KHONG_KHOP'],
  ])(
    '(DK-08) thiếu trường %s → báo đúng trường đó với mã %s',
    async (field, code) => {
      const body: Record<string, unknown> = { ...validBody };
      delete body[field];
      const errors = await errorsOf(body);
      expect(errors).toContain(`${field}:${code}`);
      // thiếu matKhau thì xacNhan cũng không khớp; ngoài ra không có trường nào khác bị báo
      const others = errors.filter((e) => !e.startsWith(`${field}:`));
      expect(others).toEqual(
        field === 'matKhau' ? ['xacNhan:XAC_NHAN_KHONG_KHOP'] : [],
      );
    },
  );

  it('(DK-08) body rỗng → đủ lỗi cho cả năm trường', async () => {
    const errors = await errorsOf({});
    const fields = new Set(errors.map((e) => e.split(':')[0]));
    expect([...fields].sort()).toEqual([
      'email',
      'hoTen',
      'matKhau',
      'soDienThoai',
      'xacNhan',
    ]);
  });

  it('(DK-09) mọi trường cùng sai → trả đủ danh sách lỗi một lần', async () => {
    const errors = await errorsOf({
      hoTen: '',
      email: 'sai',
      soDienThoai: '123',
      matKhau: 'yeu',
      xacNhan: 'khac',
    });
    expect(errors).toEqual([
      'email:EMAIL_KHONG_HOP_LE',
      'hoTen:HO_TEN_KHONG_HOP_LE',
      'matKhau:MAT_KHAU_KHONG_HOP_LE',
      'soDienThoai:SDT_KHONG_HOP_LE',
      'xacNhan:XAC_NHAN_KHONG_KHOP',
    ]);
  });
});

describe('RegisterDto — trường lạ và bí mật', () => {
  it.each([
    ['loaiTaiKhoan', 'QuanTriVien'], // leo thang đặc quyền
    ['trangThai', 'DangHoatDong'],
    ['daXacMinhEmail', true],
    ['taiKhoanId', '1'],
    ['matKhauBam', '$argon2id$gia'],
  ])(
    '(SE-05) trường lạ %s bị từ chối TRUONG_KHONG_DUOC_PHEP, không bị bỏ qua lặng lẽ',
    async (field, value) => {
      expect(await errorsOf({ ...validBody, [field]: value })).toEqual([
        `${field}:TRUONG_KHONG_DUOC_PHEP`,
      ]);
    },
  );

  it('(DK-39) lỗi kiểm dữ liệu KHÔNG chứa giá trị người dùng gửi, kể cả mật khẩu', async () => {
    const secret = 'Mat-khau-bi-mat-1!';
    let thrown: unknown;
    try {
      await parse({ ...validBody, matKhau: secret, xacNhan: 'khac-di' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AppException);
    const text = JSON.stringify((thrown as AppException).getResponse());
    expect(text).not.toContain(secret);
    expect(text).not.toContain('khac-di');
    expect(text).not.toContain(validBody.email);
  });
});
