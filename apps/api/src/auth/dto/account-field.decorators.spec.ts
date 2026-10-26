import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  IsAccountEmail,
  IsAccountPassword,
  IsAccountPhone,
  MatchesField,
} from './account-field.decorators.js';

// Task A1. Test case: DK-04, DK-05, DK-06, DK-07, DK-08, DK-09, DK-17 (kiểm ở mức DTO), DM-04 và QM-08 (cùng quy tắc mật khẩu).
// Các DTO dưới đây chỉ có trong test; DTO thật của từng endpoint thuộc A5 (đăng ký), A8 (đăng nhập), A11–A13.
class RegisterLikeDto {
  @IsAccountEmail()
  email!: string;

  @IsAccountPhone()
  soDienThoai!: string;

  @IsAccountPassword()
  matKhau!: string;

  @MatchesField('matKhau')
  xacNhanMatKhau!: string;
}

class ChangePasswordLikeDto {
  @IsAccountPassword()
  matKhauMoi!: string;

  @MatchesField('matKhauMoi')
  xacNhan!: string;
}

const validBody = {
  email: 'user@example.com',
  soDienThoai: '0901234567',
  matKhau: 'Matkhau1!',
  xacNhanMatKhau: 'Matkhau1!',
};

// Kết quả kiểm dạng { tên trường: [mã lỗi] }, chỉ gồm trường có lỗi
async function errorsOf<T extends object>(
  dto: new () => T,
  body: Record<string, unknown>,
) {
  const errors = await validate(plainToInstance(dto, body));
  return Object.fromEntries(
    errors.map((e) => [e.property, Object.values(e.constraints ?? {})]),
  );
}

// Cùng tuỳ chọn với configureApp() trong app.setup.ts
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

describe('decorator email / SĐT / mật khẩu — dữ liệu hợp lệ', () => {
  it('body hợp lệ không có lỗi', async () => {
    expect(await errorsOf(RegisterLikeDto, validBody)).toEqual({});
  });

  it('chuẩn hoá khi qua ValidationPipe: email (DK-17) và SĐT (DK-05), mật khẩu giữ nguyên không trim', async () => {
    const dto = (await pipe.transform(
      {
        email: '  Nguyen.Van@Example.COM ',
        soDienThoai: '0901 234 567',
        matKhau: ' Matkhau1! ',
        xacNhanMatKhau: ' Matkhau1! ',
      },
      { type: 'body', metatype: RegisterLikeDto },
    )) as RegisterLikeDto;
    expect(dto.email).toBe('Nguyen.Van@example.com');
    expect(dto.soDienThoai).toBe('0901234567');
    expect(dto.matKhau).toBe(' Matkhau1! ');
    expect(dto.xacNhanMatKhau).toBe(' Matkhau1! ');
  });
});

describe('decorator — mật khẩu không bị trim khi kiểm (DK-06, N10)', () => {
  it('mật khẩu chỉ đủ 8 ký tự nhờ dấu cách hai đầu vẫn hợp lệ; bỏ dấu cách đi thì đã quá ngắn', async () => {
    const matKhau = '1!      ';
    expect(
      await errorsOf(RegisterLikeDto, {
        ...validBody,
        matKhau,
        xacNhanMatKhau: matKhau,
      }),
    ).toEqual({});
    const trimmed = matKhau.trim();
    expect(
      await errorsOf(RegisterLikeDto, {
        ...validBody,
        matKhau: trimmed,
        xacNhanMatKhau: trimmed,
      }),
    ).toEqual({
      matKhau: ['MAT_KHAU_KHONG_HOP_LE'],
    });
  });
});

describe('decorator — từng trường sai trả đúng mã của trường đó (DK-04, DK-05, DK-06, DK-07)', () => {
  it.each(['', 'abc', 'a@b', 'nguyễn@example.com', `${'a'.repeat(250)}@b.com`])(
    'email %j → EMAIL_KHONG_HOP_LE (DK-04)',
    async (email) => {
      expect(await errorsOf(RegisterLikeDto, { ...validBody, email })).toEqual({
        email: ['EMAIL_KHONG_HOP_LE'],
      });
    },
  );

  it.each(['', '090123456', '+84901234567', '0901-234-567', '1901234567'])(
    'SĐT %j → SDT_KHONG_HOP_LE (DK-05)',
    async (soDienThoai) => {
      expect(
        await errorsOf(RegisterLikeDto, { ...validBody, soDienThoai }),
      ).toEqual({ soDienThoai: ['SDT_KHONG_HOP_LE'] });
    },
  );

  it.each([
    ['Abcde1!', 'MAT_KHAU_KHONG_HOP_LE'],
    ['Matkhauuu!', 'MAT_KHAU_KHONG_HOP_LE'],
    ['Matkhau12', 'MAT_KHAU_KHONG_HOP_LE'],
    ['Mậtkhẩu1!', 'MAT_KHAU_KY_TU_KHONG_HOP_LE'],
    ['Matkhau1!😀', 'MAT_KHAU_KY_TU_KHONG_HOP_LE'],
  ])('mật khẩu %j → %s (DK-06)', async (matKhau, code) => {
    // Gán cả xác nhận cùng giá trị để chỉ còn lỗi của chính mật khẩu
    expect(
      await errorsOf(RegisterLikeDto, {
        ...validBody,
        matKhau,
        xacNhanMatKhau: matKhau,
      }),
    ).toEqual({
      matKhau: [code],
    });
  });

  it('xác nhận mật khẩu không khớp → XAC_NHAN_KHONG_KHOP (DK-07), phân biệt hoa/thường và dấu cách', async () => {
    for (const xacNhanMatKhau of ['Matkhau1?', 'matkhau1!', 'Matkhau1! ', '']) {
      expect(
        await errorsOf(RegisterLikeDto, { ...validBody, xacNhanMatKhau }),
      ).toEqual({
        xacNhanMatKhau: ['XAC_NHAN_KHONG_KHOP'],
      });
    }
  });
});

describe('decorator — thiếu trường và nhiều lỗi cùng lúc (DK-08, DK-09)', () => {
  it.each([
    ['email', 'EMAIL_KHONG_HOP_LE'],
    ['soDienThoai', 'SDT_KHONG_HOP_LE'],
    ['matKhau', 'MAT_KHAU_KHONG_HOP_LE'],
    ['xacNhanMatKhau', 'XAC_NHAN_KHONG_KHOP'],
  ])(
    'thiếu trường %s → chỉ báo lỗi %s của đúng trường đó (DK-08)',
    async (field, code) => {
      const body: Record<string, unknown> = { ...validBody };
      delete body[field];
      const errors = await errorsOf(RegisterLikeDto, body);
      expect(errors[field]).toEqual([code]);
      // Thiếu mật khẩu thì xác nhận (còn đủ) cũng không khớp; ngoài ra không trường nào khác bị báo
      const expectedFields =
        field === 'matKhau' ? ['matKhau', 'xacNhanMatKhau'] : [field];
      expect(Object.keys(errors).sort()).toEqual(expectedFields.sort());
    },
  );

  it.each([null, 123, true, {}, ['Matkhau1!']])(
    'giá trị không phải chuỗi %j bị từ chối bằng mã của trường, không ném lỗi',
    async (value) => {
      expect(
        await errorsOf(RegisterLikeDto, {
          ...validBody,
          email: value,
          soDienThoai: value,
          matKhau: value,
          xacNhanMatKhau: value,
        }),
      ).toEqual({
        email: ['EMAIL_KHONG_HOP_LE'],
        soDienThoai: ['SDT_KHONG_HOP_LE'],
        matKhau: ['MAT_KHAU_KHONG_HOP_LE'],
        xacNhanMatKhau: ['XAC_NHAN_KHONG_KHOP'],
      });
    },
  );

  it('nhiều trường lỗi cùng lúc: trả đủ danh sách, mỗi trường đúng một mã (DK-09)', async () => {
    const errors = await errorsOf(RegisterLikeDto, {
      email: 'khong-phai-email',
      soDienThoai: '123',
      matKhau: 'ngan',
      xacNhanMatKhau: 'khac',
    });
    expect(errors).toEqual({
      email: ['EMAIL_KHONG_HOP_LE'],
      soDienThoai: ['SDT_KHONG_HOP_LE'],
      matKhau: ['MAT_KHAU_KHONG_HOP_LE'],
      xacNhanMatKhau: ['XAC_NHAN_KHONG_KHOP'],
    });
  });

  it('qua ValidationPipe: 400 liệt kê đủ mã lỗi và KHÔNG chứa giá trị mật khẩu (DK-09)', async () => {
    const secret = 'MatKhauBiMat-ngan';
    const call = pipe.transform(
      {
        email: 'sai',
        soDienThoai: '1',
        matKhau: secret,
        xacNhanMatKhau: 'khac-nua',
      },
      { type: 'body', metatype: RegisterLikeDto },
    );
    const error = await call.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    const body = JSON.stringify((error as BadRequestException).getResponse());
    for (const code of [
      'EMAIL_KHONG_HOP_LE',
      'SDT_KHONG_HOP_LE',
      'MAT_KHAU_KHONG_HOP_LE',
      'XAC_NHAN_KHONG_KHOP',
    ]) {
      expect(body).toContain(code);
    }
    expect(body).not.toContain(secret);
    expect(body).not.toContain('khac-nua');
  });

  it('trường lạ bị ValidationPipe từ chối, kể cả khi cố truyền tai_khoan_id', async () => {
    const call = pipe.transform(
      { ...validBody, tai_khoan_id: '1' },
      { type: 'body', metatype: RegisterLikeDto },
    );
    await expect(call).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('decorator — mật khẩu mới khi đổi / đặt lại mật khẩu (DM-04, QM-08)', () => {
  it('mật khẩu mới không đạt hoặc không khớp xác nhận → mã tương ứng', async () => {
    expect(
      await errorsOf(ChangePasswordLikeDto, {
        matKhauMoi: 'Abcde1!',
        xacNhan: 'Abcde1!',
      }),
    ).toEqual({
      matKhauMoi: ['MAT_KHAU_KHONG_HOP_LE'],
    });
    expect(
      await errorsOf(ChangePasswordLikeDto, {
        matKhauMoi: 'Matkhau1!',
        xacNhan: 'Matkhau2!',
      }),
    ).toEqual({
      xacNhan: ['XAC_NHAN_KHONG_KHOP'],
    });
    expect(
      await errorsOf(ChangePasswordLikeDto, {
        matKhauMoi: 'Matkhau1!',
        xacNhan: 'Matkhau1!',
      }),
    ).toEqual({});
  });
});
