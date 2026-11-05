import { ValidationPipe } from '@nestjs/common';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import { UpdateProfileDto } from './profile.dto.js';

// Task B2 — `UpdateProfileDto` NỐI DÂY đúng decorator cho từng trường, qua ĐÚNG cấu hình ValidationPipe của configureApp (app.setup.ts).
// Luật từng trường đã có test riêng ở P1 (patient/validation/*.spec.ts, auth/validation): ở đây mỗi trường chỉ cần đủ ca chứng minh
// nó gắn đúng decorator, đúng kiểu trường (TRACKING patient B2-B, B2-G). Mã ca PUD-nn là [đề xuất]. Mọi giá trị là dữ liệu giả.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const VALID = {
  hoTen: 'Nguyễn Văn A',
  soDienThoai: '0901234567',
  gioiTinh: 'Nam',
  ngaySinh: '1990-05-15',
  diaChi: '12 Lê Lợi, Quận 1',
};
const FIELDS = [
  'hoTen',
  'soDienThoai',
  'gioiTinh',
  'ngaySinh',
  'diaChi',
] as const;
const FIELD_CODE = {
  hoTen: 'HO_TEN_KHONG_HOP_LE',
  soDienThoai: 'SDT_KHONG_HOP_LE',
  gioiTinh: 'GIOI_TINH_KHONG_HOP_LE',
  ngaySinh: 'NGAY_SINH_KHONG_HOP_LE',
  diaChi: 'DIA_CHI_KHONG_HOP_LE',
} as const;

const parse = (body: unknown) =>
  pipe.transform(body, {
    type: 'body',
    metatype: UpdateProfileDto,
  }) as Promise<UpdateProfileDto>;

async function rejectionOf(body: unknown): Promise<AppException> {
  try {
    await parse(body);
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('body lẽ ra phải bị từ chối');
}

interface FieldError {
  truong: string;
  ma: string;
}

// Danh sách lỗi theo ĐÚNG thứ tự trong loi[]; kiểm luôn 400 DU_LIEU_KHONG_HOP_LE
async function errorsOf(body: unknown): Promise<FieldError[]> {
  const error = await rejectionOf(body);
  expect(error.getStatus()).toBe(400);
  expect(error.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
  return (error.getResponse() as { loi: FieldError[] }).loi;
}

const asPairs = (errors: FieldError[]) =>
  errors.map((item) => `${item.truong}:${item.ma}`);

function without(field: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...VALID };
  delete copy[field];
  return copy;
}

// Hôm nay cố định là 05/11/2026 giờ VN (12:00 +07:00) cho mọi ca không thử nửa đêm
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T05:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UpdateProfileDto qua ValidationPipe của configureApp', () => {
  it('PUD-01 (HS-04) thân hợp lệ đủ năm trường ⇒ UpdateProfileDto với đúng năm giá trị, không thêm khoá', async () => {
    const dto = await parse(VALID);

    expect(dto).toBeInstanceOf(UpdateProfileDto);
    expect(Object.keys(dto).sort()).toEqual(Object.keys(VALID).sort());
    expect(dto).toMatchObject(VALID);
  });

  it.each([
    'email',
    'anhDaiDien',
    'soCccd',
    'taiKhoanId',
    'vaiTro',
    'trangThai',
    'chiNhanhId',
    'loaiTaiKhoan',
    'benhNhanId',
    'trangThaiHieuLuc',
  ])(
    'PUD-02 (HS-06, HS-07, HS-24) trường lạ %s ⇒ đúng một mục TRUONG_KHONG_DUOC_PHEP của trường đó, không thêm lỗi nào khác',
    async (field) => {
      const errors = await errorsOf({ ...VALID, [field]: 'x' });

      expect(asPairs(errors)).toEqual([`${field}:TRUONG_KHONG_DUOC_PHEP`]);
    },
  );

  it.each(FIELDS)(
    'PUD-03 (PLAN 5.2) PUT thay cả bộ: thiếu khoá %s ⇒ đúng mã của trường đó (không phải "giữ nguyên")',
    async (field) => {
      const errors = await errorsOf(without(field));

      expect(asPairs(errors)).toEqual([`${field}:${FIELD_CODE[field]}`]);
    },
  );

  it('PUD-04 (HS-14) null ở giới tính, ngày sinh, địa chỉ ⇒ qua và còn null; null ở họ tên, SĐT ⇒ lỗi của trường', async () => {
    const dto = await parse({
      ...VALID,
      gioiTinh: null,
      ngaySinh: null,
      diaChi: null,
    });
    expect([dto.gioiTinh, dto.ngaySinh, dto.diaChi]).toEqual([
      null,
      null,
      null,
    ]);

    expect(asPairs(await errorsOf({ ...VALID, hoTen: null }))).toEqual([
      'hoTen:HO_TEN_KHONG_HOP_LE',
    ]);
    expect(asPairs(await errorsOf({ ...VALID, soDienThoai: null }))).toEqual([
      'soDienThoai:SDT_KHONG_HOP_LE',
    ]);
  });

  it('PUD-05 (HS-10) họ tên: NFD thừa khoảng trắng ⇒ NFC đã cắt; rỗng hoặc chỉ khoảng trắng ⇒ HO_TEN_KHONG_HOP_LE', async () => {
    const dto = await parse({
      ...VALID,
      hoTen: '  Nguyễn Văn A  ',
    });
    expect(dto.hoTen).toBe('Nguyễn Văn A');

    for (const hoTen of ['', '   ']) {
      expect(asPairs(await errorsOf({ ...VALID, hoTen }))).toEqual([
        'hoTen:HO_TEN_KHONG_HOP_LE',
      ]);
    }
  });

  it('PUD-06 (HS-08) SĐT: dấu cách hoặc chấm ⇒ 10 số liền; +84…, hai dấu cách liền, 9 số ⇒ SDT_KHONG_HOP_LE', async () => {
    for (const soDienThoai of [' 0901 234 567 ', '0901.234.567']) {
      expect((await parse({ ...VALID, soDienThoai })).soDienThoai).toBe(
        '0901234567',
      );
    }
    for (const soDienThoai of ['+84901234567', '0901  234 567', '090123456']) {
      expect(asPairs(await errorsOf({ ...VALID, soDienThoai }))).toEqual([
        'soDienThoai:SDT_KHONG_HOP_LE',
      ]);
    }
  });

  it('PUD-07 (HS-09) ngày sinh: 15/05/1990, 2026-02-30, ngày mai theo giờ VN ⇒ NGAY_SINH_KHONG_HOP_LE; 1900-01-01 và hôm nay qua', async () => {
    for (const ngaySinh of ['15/05/1990', '2026-02-30', '2026-11-06']) {
      expect(asPairs(await errorsOf({ ...VALID, ngaySinh }))).toEqual([
        'ngaySinh:NGAY_SINH_KHONG_HOP_LE',
      ]);
    }
    for (const ngaySinh of ['1900-01-01', '2026-11-05']) {
      expect((await parse({ ...VALID, ngaySinh })).ngaySinh).toBe(ngaySinh);
    }
  });

  it('PUD-07b (HS-09) "hôm nay" tính theo giờ Việt Nam: 23:59:59 và 00:00:00 +07:00 quanh nửa đêm', async () => {
    vi.setSystemTime(new Date('2026-11-05T16:59:59.000Z')); // 23:59:59 ngày 05/11 giờ VN
    expect(
      asPairs(await errorsOf({ ...VALID, ngaySinh: '2026-11-06' })),
    ).toEqual(['ngaySinh:NGAY_SINH_KHONG_HOP_LE']);

    vi.setSystemTime(new Date('2026-11-05T17:00:00.000Z')); // 00:00:00 ngày 06/11 giờ VN
    expect((await parse({ ...VALID, ngaySinh: '2026-11-06' })).ngaySinh).toBe(
      '2026-11-06',
    );
    expect(
      asPairs(await errorsOf({ ...VALID, ngaySinh: '2026-11-07' })),
    ).toEqual(['ngaySinh:NGAY_SINH_KHONG_HOP_LE']);
  });

  it('PUD-08 (HS-11) địa chỉ: rỗng hoặc chỉ khoảng trắng ⇒ null; cắt hai đầu; xuống dòng và 256 ký tự ⇒ lỗi; 255 qua', async () => {
    for (const diaChi of ['', '   ']) {
      expect((await parse({ ...VALID, diaChi })).diaChi).toBeNull();
    }
    expect((await parse({ ...VALID, diaChi: '  12 Lê Lợi  ' })).diaChi).toBe(
      '12 Lê Lợi',
    );
    expect(
      (await parse({ ...VALID, diaChi: 'a'.repeat(255) })).diaChi,
    ).toHaveLength(255);
    for (const diaChi of ['dòng 1\ndòng 2', 'a'.repeat(256)]) {
      expect(asPairs(await errorsOf({ ...VALID, diaChi }))).toEqual([
        'diaChi:DIA_CHI_KHONG_HOP_LE',
      ]);
    }
  });

  it('PUD-09 (HS-12) giới tính: Nam, Nu, Khac qua; nam, Nữ, rỗng, số ⇒ GIOI_TINH_KHONG_HOP_LE', async () => {
    for (const gioiTinh of ['Nam', 'Nu', 'Khac']) {
      expect((await parse({ ...VALID, gioiTinh })).gioiTinh).toBe(gioiTinh);
    }
    for (const gioiTinh of ['nam', 'Nữ', '', 1]) {
      expect(asPairs(await errorsOf({ ...VALID, gioiTinh }))).toEqual([
        'gioiTinh:GIOI_TINH_KHONG_HOP_LE',
      ]);
    }
  });

  it('PUD-10 (HS-13) nhiều lỗi cùng lúc ⇒ loi[] đủ mọi trường: trường lạ đứng trước, rồi các trường của DTO theo thứ tự khai báo', async () => {
    const errors = await errorsOf({
      email: 'a@b.invalid',
      hoTen: '',
      soDienThoai: '123',
      gioiTinh: 'x',
      ngaySinh: '2999-01-01',
      diaChi: 'a\nb',
    });

    expect(asPairs(errors)).toEqual([
      'email:TRUONG_KHONG_DUOC_PHEP',
      'hoTen:HO_TEN_KHONG_HOP_LE',
      'soDienThoai:SDT_KHONG_HOP_LE',
      'gioiTinh:GIOI_TINH_KHONG_HOP_LE',
      'ngaySinh:NGAY_SINH_KHONG_HOP_LE',
      'diaChi:DIA_CHI_KHONG_HOP_LE',
    ]);
  });

  it('PUD-11 (BM-01) thân lỗi chỉ có maLoi, thongBao, loi; mỗi mục chỉ truong và ma; không chứa giá trị đã gửi', async () => {
    const error = await rejectionOf({
      hoTen: 'GIA-TRI-HO-TEN-NHAN-DIEN',
      soDienThoai: 'GIA-TRI-SDT-NHAN-DIEN',
      gioiTinh: 'GIA-TRI-GIOI-TINH-NHAN-DIEN',
      ngaySinh: 'GIA-TRI-NGAY-NHAN-DIEN',
      diaChi: 'a\nGIA-TRI-DIA-CHI-NHAN-DIEN',
      email: 'GIA-TRI-EMAIL-NHAN-DIEN@x.invalid',
    });

    const response = error.getResponse() as Record<string, unknown>;
    expect(Object.keys(response).sort()).toEqual(['loi', 'maLoi', 'thongBao']);
    for (const item of response['loi'] as object[]) {
      expect(Object.keys(item).sort()).toEqual(['ma', 'truong']);
    }
    expect(JSON.stringify(response)).not.toContain('NHAN-DIEN');
  });

  it.each([
    ['mảng', [VALID]],
    ['chuỗi', 'abc'],
    ['undefined', undefined],
    ['null', null],
  ])(
    'PUD-12 (ca âm) thân là %s ⇒ 400 DU_LIEU_KHONG_HOP_LE, không lỗi lạ',
    async (_label, body) => {
      const errors = await errorsOf(body);

      expect(errors.length).toBeGreaterThan(0);
    },
  );

  it('PUD-12b (ca âm) sai kiểu ở cả năm trường (số, mảng, đối tượng) ⇒ mỗi trường báo mã của chính nó', async () => {
    const errors = await errorsOf({
      hoTen: 123,
      soDienThoai: 901234567,
      gioiTinh: ['Nam'],
      ngaySinh: 19900515,
      diaChi: { dong: 1 },
    });

    expect(asPairs(errors)).toEqual(
      FIELDS.map((field) => `${field}:${FIELD_CODE[field]}`),
    );
  });
});
