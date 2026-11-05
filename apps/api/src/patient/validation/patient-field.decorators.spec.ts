import { ValidationPipe } from '@nestjs/common';
import {
  IsAccountFullName,
  IsAccountPhone,
} from '../../auth/dto/account-field.decorators.js';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import {
  IsAddress,
  IsBirthDate,
  IsGender,
  IsOptionalPhone,
  IsRelationship,
} from './patient-field.decorators.js';

// patient P1 (TRACKING patient P1-D, P1-F). Test case ở mức DTO: HS-09, HS-11, HS-12 (cùng HS-08, HS-10 qua decorator của auth),
// NT-02, NT-03, NT-04; ba kiểu trường (bắt buộc / có khoá được null / tuỳ chọn). Kiểm bằng ĐÚNG cấu hình ValidationPipe của configureApp.
// Hai DTO dưới đây chỉ có trong test; DTO thật là `profile.dto.ts` (B2) và `relatives.dto.ts` (B3). Mọi giá trị là dữ liệu giả.

class ProfileLikeDto {
  @IsAccountFullName()
  hoTen!: string;

  @IsAccountPhone()
  soDienThoai!: string;

  @IsGender({ nullable: true })
  gioiTinh!: string | null;

  @IsBirthDate({ nullable: true })
  ngaySinh!: string | null;

  @IsAddress()
  diaChi!: string | null;
}

class RelativeLikeDto {
  @IsAccountFullName()
  hoTen!: string;

  @IsRelationship()
  moiQuanHe!: string;

  @IsGender()
  gioiTinh!: string;

  @IsBirthDate()
  ngaySinh!: string;

  @IsOptionalPhone()
  soDienThoai?: string | null;
}

// Cùng tuỳ chọn với configureApp() trong app.setup.ts
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const validProfile = {
  hoTen: 'Nguyễn Văn A',
  soDienThoai: '0901234567',
  gioiTinh: 'Nam',
  ngaySinh: '1990-05-15',
  diaChi: '12 Lê Lợi, Quận 1',
};

const validRelative = {
  hoTen: 'Nguyễn Thị B',
  moiQuanHe: 'Me',
  gioiTinh: 'Nu',
  ngaySinh: '1965-01-20',
  soDienThoai: '0907654321',
};

function parse<T extends object>(
  metatype: new () => T,
  body: unknown,
): Promise<T> {
  return pipe.transform(body, { type: 'body', metatype }) as Promise<T>;
}

async function rejectionOf(
  metatype: new () => object,
  body: unknown,
): Promise<AppException> {
  try {
    await parse(metatype, body);
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('body lẽ ra phải bị từ chối');
}

// Danh sách lỗi dạng "truong:ma", đã sắp xếp
async function errorsOf(
  metatype: new () => object,
  body: unknown,
): Promise<string[]> {
  const error = await rejectionOf(metatype, body);
  expect(error.getStatus()).toBe(400);
  expect(error.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
  const response = error.getResponse() as {
    loi: { truong: string; ma: string }[];
  };
  return response.loi.map((item) => `${item.truong}:${item.ma}`).sort();
}

const withField = (base: object, field: string, value: unknown) => ({
  ...base,
  [field]: value,
});

function without(base: Record<string, unknown>, field: string) {
  const copy = { ...base };
  delete copy[field];
  return copy;
}

// Hôm nay cố định là 04/11/2026 giờ VN (12:00 +07:00) cho mọi ca không thử nửa đêm
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-04T05:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('hồ sơ bản thân (kiểu ii: có khoá, được null)', () => {
  it('(HS-09, HS-11, HS-12) body hợp lệ qua kiểm, chuẩn hoá SĐT, họ tên và địa chỉ', async () => {
    const dto = await parse(ProfileLikeDto, {
      ...validProfile,
      hoTen: ' Nguyễn Văn A ',
      soDienThoai: '0901 234 567',
      diaChi: '  12 Lê Lợi, Quận 1 ',
    });
    expect(dto).toBeInstanceOf(ProfileLikeDto);
    expect(dto).toEqual({
      ...validProfile,
      hoTen: 'Nguyễn Văn A',
      soDienThoai: '0901234567',
      diaChi: '12 Lê Lợi, Quận 1',
    });
  });

  it('(HS-09, HS-11, HS-12) gửi null cho giới tính, ngày sinh, địa chỉ: qua, giữ null (xoá giá trị)', async () => {
    const dto = await parse(ProfileLikeDto, {
      ...validProfile,
      gioiTinh: null,
      ngaySinh: null,
      diaChi: null,
    });
    expect(dto.gioiTinh).toBeNull();
    expect(dto.ngaySinh).toBeNull();
    expect(dto.diaChi).toBeNull();
  });

  it.each(['', '   ', ' \t\n '])(
    '(HS-11) địa chỉ rỗng hoặc chỉ khoảng trắng ASCII ⇒ null: %j',
    async (diaChi) => {
      const dto = await parse(ProfileLikeDto, { ...validProfile, diaChi });
      expect(dto.diaChi).toBeNull();
    },
  );

  it.each([
    ['gioiTinh', 'GIOI_TINH_KHONG_HOP_LE'],
    ['ngaySinh', 'NGAY_SINH_KHONG_HOP_LE'],
    ['diaChi', 'DIA_CHI_KHONG_HOP_LE'],
  ])(
    '(HS-09, HS-11, HS-12) thiếu khoá %s là lỗi (PUT thay cả bộ trường)',
    async (field, code) => {
      expect(
        await errorsOf(ProfileLikeDto, without(validProfile, field)),
      ).toEqual([`${field}:${code}`]);
    },
  );

  it.each(['2026-11-04', '1900-01-01', '2000-02-29'])(
    '(HS-09) ngày sinh hợp lệ: %s',
    async (ngaySinh) => {
      const dto = await parse(ProfileLikeDto, { ...validProfile, ngaySinh });
      expect(dto.ngaySinh).toBe(ngaySinh);
    },
  );

  it.each([
    '2026-02-30',
    '15/05/1990',
    '2026-11-05',
    '1899-12-31',
    ' 1990-05-15',
    '1990-05-15 ',
    '',
  ])('(HS-09) ngày sinh không hợp lệ: %j', async (ngaySinh) => {
    expect(
      await errorsOf(ProfileLikeDto, { ...validProfile, ngaySinh }),
    ).toEqual(['ngaySinh:NGAY_SINH_KHONG_HOP_LE']);
  });

  it.each([
    ['255 ký tự', 'ạ'.repeat(255)],
    ['255 ký tự kèm khoảng trắng hai đầu', ` ${'ạ'.repeat(255)} `],
  ])('(HS-11) địa chỉ %s qua', async (_label, diaChi) => {
    const dto = await parse(ProfileLikeDto, { ...validProfile, diaChi });
    expect(dto.diaChi).toBe('ạ'.repeat(255));
  });

  it.each([
    ['256 ký tự', 'ạ'.repeat(256)],
    ['có xuống dòng', '12 Lê Lợi\nQuận 1'],
    ['có ký tự rộng 0', '12 Lê​ Lợi'],
  ])('(HS-11) địa chỉ %s ⇒ DIA_CHI_KHONG_HOP_LE', async (_label, diaChi) => {
    expect(await errorsOf(ProfileLikeDto, { ...validProfile, diaChi })).toEqual(
      ['diaChi:DIA_CHI_KHONG_HOP_LE'],
    );
  });

  it.each(['Nam', 'Nu', 'Khac'])(
    '(HS-12) giới tính hợp lệ: %s',
    async (gioiTinh) => {
      const dto = await parse(ProfileLikeDto, { ...validProfile, gioiTinh });
      expect(dto.gioiTinh).toBe(gioiTinh);
    },
  );

  it.each(['nam', 'Nữ', 'Male', '', ' Nam'])(
    '(HS-12) giới tính không hợp lệ: %j',
    async (gioiTinh) => {
      expect(
        await errorsOf(ProfileLikeDto, { ...validProfile, gioiTinh }),
      ).toEqual(['gioiTinh:GIOI_TINH_KHONG_HOP_LE']);
    },
  );

  it.each([
    ['gioiTinh', 'GIOI_TINH_KHONG_HOP_LE'],
    ['ngaySinh', 'NGAY_SINH_KHONG_HOP_LE'],
    ['diaChi', 'DIA_CHI_KHONG_HOP_LE'],
  ])(
    '(HS-09, HS-11, HS-12) %s sai kiểu (số, boolean, Date, mảng, đối tượng) ⇒ mã của trường',
    async (field, code) => {
      for (const value of [1, true, new Date(), ['Nam'], { a: 'Nam' }]) {
        expect(
          await errorsOf(ProfileLikeDto, withField(validProfile, field, value)),
        ).toEqual([`${field}:${code}`]);
      }
    },
  );

  it('(HS-08, HS-10) họ tên và SĐT dùng decorator của auth: sai ⇒ mã của auth', async () => {
    expect(
      await errorsOf(ProfileLikeDto, {
        ...validProfile,
        hoTen: '   ',
        soDienThoai: '090123456',
      }),
    ).toEqual(['hoTen:HO_TEN_KHONG_HOP_LE', 'soDienThoai:SDT_KHONG_HOP_LE']);
  });

  it('(HS-06 mức DTO) trường lạ email ⇒ TRUONG_KHONG_DUOC_PHEP', async () => {
    expect(
      await errorsOf(ProfileLikeDto, {
        ...validProfile,
        email: 'gia@example.com',
      }),
    ).toEqual(['email:TRUONG_KHONG_DUOC_PHEP']);
  });

  it('(HS-09, HS-11, HS-12) nhiều trường sai cùng lúc ⇒ loi[] có đủ từng trường', async () => {
    expect(
      await errorsOf(ProfileLikeDto, {
        hoTen: 'Nguyễn Văn A',
        soDienThoai: '0901234567',
        gioiTinh: 'nam',
        ngaySinh: '2026-02-30',
        diaChi: 'a\nb',
      }),
    ).toEqual([
      'diaChi:DIA_CHI_KHONG_HOP_LE',
      'gioiTinh:GIOI_TINH_KHONG_HOP_LE',
      'ngaySinh:NGAY_SINH_KHONG_HOP_LE',
    ]);
  });
});

describe('hồ sơ người thân (kiểu i: bắt buộc; kiểu iii: SĐT tuỳ chọn)', () => {
  it('(NT-02) body hợp lệ qua kiểm', async () => {
    const dto = await parse(RelativeLikeDto, validRelative);
    expect(dto).toBeInstanceOf(RelativeLikeDto);
    expect(dto).toEqual(validRelative);
  });

  it.each([
    ['hoTen', 'HO_TEN_KHONG_HOP_LE'],
    ['moiQuanHe', 'MOI_QUAN_HE_KHONG_HOP_LE'],
    ['gioiTinh', 'GIOI_TINH_KHONG_HOP_LE'],
    ['ngaySinh', 'NGAY_SINH_KHONG_HOP_LE'],
  ])(
    '(NT-02) %s bắt buộc: thiếu khoá, null, rỗng, sai kiểu đều ⇒ mã của trường',
    async (field, code) => {
      const bodies = [
        without(validRelative, field),
        ...[null, '', 1, ['Nam'], {}].map((value) =>
          withField(validRelative, field, value),
        ),
      ];
      for (const body of bodies) {
        expect(await errorsOf(RelativeLikeDto, body)).toEqual([
          `${field}:${code}`,
        ]);
      }
    },
  );

  it.each(['Cha', 'Me', 'Vo', 'Chong', 'Con', 'AnhChiEm', 'OngBa', 'Khac'])(
    '(NT-03) mối quan hệ hợp lệ: %s',
    async (moiQuanHe) => {
      const dto = await parse(RelativeLikeDto, { ...validRelative, moiQuanHe });
      expect(dto.moiQuanHe).toBe(moiQuanHe);
    },
  );

  it.each(['Ban', 'me', 'Mẹ'])(
    '(NT-03) mối quan hệ ngoài 8 giá trị: %s',
    async (moiQuanHe) => {
      expect(
        await errorsOf(RelativeLikeDto, { ...validRelative, moiQuanHe }),
      ).toEqual(['moiQuanHe:MOI_QUAN_HE_KHONG_HOP_LE']);
    },
  );

  it('(NT-04) ngày sinh sai định dạng khi có nhập ⇒ NGAY_SINH_KHONG_HOP_LE', async () => {
    expect(
      await errorsOf(RelativeLikeDto, {
        ...validRelative,
        ngaySinh: '20/01/1965',
      }),
    ).toEqual(['ngaySinh:NGAY_SINH_KHONG_HOP_LE']);
  });

  it('(NT-04) thiếu khoá SĐT: qua, thuộc tính để undefined (nơi lưu ghi NULL)', async () => {
    const dto = await parse(
      RelativeLikeDto,
      without(validRelative, 'soDienThoai'),
    );
    expect(dto.soDienThoai).toBeUndefined();
  });

  it.each([null, '', '   ', ' \t '])(
    '(NT-04) SĐT null, rỗng hoặc chỉ khoảng trắng ASCII ⇒ null: %j',
    async (soDienThoai) => {
      const dto = await parse(RelativeLikeDto, {
        ...validRelative,
        soDienThoai,
      });
      expect(dto.soDienThoai).toBeNull();
    },
  );

  it.each([
    [' 0907.654.321 ', '0907654321'],
    ['0907 654 321', '0907654321'],
  ])('(NT-04) SĐT có nhập: chuẩn hoá %j ⇒ %s', async (soDienThoai, saved) => {
    const dto = await parse(RelativeLikeDto, {
      ...validRelative,
      soDienThoai,
    });
    expect(dto.soDienThoai).toBe(saved);
  });

  it.each(['12345', '090765432', '+84907654321', '0907  654 321', 907654321])(
    '(NT-04) SĐT sai khi có nhập: %j ⇒ SDT_KHONG_HOP_LE',
    async (soDienThoai) => {
      expect(
        await errorsOf(RelativeLikeDto, { ...validRelative, soDienThoai }),
      ).toEqual(['soDienThoai:SDT_KHONG_HOP_LE']);
    },
  );

  it('(NT-05 mức DTO) người thân không có trường diaChi (Q8) ⇒ TRUONG_KHONG_DUOC_PHEP', async () => {
    expect(
      await errorsOf(RelativeLikeDto, { ...validRelative, diaChi: 'Số 1' }),
    ).toEqual(['diaChi:TRUONG_KHONG_DUOC_PHEP']);
  });
});

describe('ngày sinh theo nửa đêm giờ Việt Nam (todayVN tính lúc kiểm)', () => {
  it('(HS-09) 04/11/2026 23:59:59 giờ VN: hôm nay qua, 05/11 bị từ chối', async () => {
    vi.setSystemTime(new Date('2026-11-04T16:59:59.000Z'));
    expect(
      (
        await parse(RelativeLikeDto, {
          ...validRelative,
          ngaySinh: '2026-11-04',
        })
      ).ngaySinh,
    ).toBe('2026-11-04');
    expect(
      await errorsOf(RelativeLikeDto, {
        ...validRelative,
        ngaySinh: '2026-11-05',
      }),
    ).toEqual(['ngaySinh:NGAY_SINH_KHONG_HOP_LE']);
  });

  it('(HS-09) 05/11/2026 00:00:00 giờ VN: 05/11 qua', async () => {
    vi.setSystemTime(new Date('2026-11-04T17:00:00.000Z'));
    expect(
      (await parse(ProfileLikeDto, { ...validProfile, ngaySinh: '2026-11-05' }))
        .ngaySinh,
    ).toBe('2026-11-05');
  });
});

describe('lỗi không mang giá trị người dùng gửi', () => {
  it('(HS-13 mức DTO) JSON lỗi chỉ có truong, ma; không chứa giá trị đã gửi', async () => {
    const sent = {
      hoTen: 'Tên Giả 1\u0000',
      soDienThoai: '0999-GIA-123',
      gioiTinh: 'GioiTinhGia',
      ngaySinh: '1899-12-31',
      diaChi: 'Đường Giả 99\nPhường Giả',
    };
    const error = await rejectionOf(ProfileLikeDto, sent);
    const json = JSON.stringify(error.getResponse());
    for (const value of Object.values(sent)) {
      expect(json).not.toContain(JSON.stringify(value).slice(1, -1));
    }
    const { loi } = error.getResponse() as { loi: object[] };
    expect(loi).toHaveLength(5);
    for (const item of loi)
      expect(Object.keys(item).sort()).toEqual(['ma', 'truong']);
  });
});
