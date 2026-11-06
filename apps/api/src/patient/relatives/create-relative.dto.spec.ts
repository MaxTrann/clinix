import { ValidationPipe } from '@nestjs/common';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import { CreateRelativeDto } from './relatives.dto.js';

// Task B3 — `CreateRelativeDto` NỐI DÂY đúng decorator cho từng trường, qua ĐÚNG cấu hình ValidationPipe của configureApp (app.setup.ts).
// Luật từng trường đã có test riêng ở P1 (patient/validation/*.spec.ts, auth/validation): ở đây mỗi trường chỉ cần đủ ca chứng minh
// nó gắn đúng decorator, đúng kiểu trường (TRACKING patient B3-B, B3-G). Mã ca RLD-nn là [đề xuất]. Mọi giá trị là dữ liệu giả.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const VALID = {
  hoTen: 'Nguyễn Văn Thử',
  moiQuanHe: 'Con',
  gioiTinh: 'Nam',
  ngaySinh: '2015-05-20',
  soDienThoai: '0901234567',
};
const REQUIRED = ['hoTen', 'moiQuanHe', 'gioiTinh', 'ngaySinh'] as const;
const FIELD_CODE = {
  hoTen: 'HO_TEN_KHONG_HOP_LE',
  moiQuanHe: 'MOI_QUAN_HE_KHONG_HOP_LE',
  gioiTinh: 'GIOI_TINH_KHONG_HOP_LE',
  ngaySinh: 'NGAY_SINH_KHONG_HOP_LE',
  soDienThoai: 'SDT_KHONG_HOP_LE',
} as const;
const RELATIONSHIPS = [
  'Cha',
  'Me',
  'Vo',
  'Chong',
  'Con',
  'AnhChiEm',
  'OngBa',
  'Khac',
];

const parse = (body: unknown) =>
  pipe.transform(body, {
    type: 'body',
    metatype: CreateRelativeDto,
  }) as Promise<CreateRelativeDto>;

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

describe('CreateRelativeDto qua ValidationPipe của configureApp', () => {
  it('RLD-01 (NT-01) thân hợp lệ đủ năm trường ⇒ CreateRelativeDto với đúng năm giá trị, không thêm khoá', async () => {
    const dto = await parse(VALID);

    expect(dto).toBeInstanceOf(CreateRelativeDto);
    expect(Object.keys(dto).sort()).toEqual(Object.keys(VALID).sort());
    expect(dto).toMatchObject(VALID);
  });

  it.each([
    'benhNhanId',
    'trangThaiHieuLuc',
    'hoSoNguoiThanId',
    'diaChi',
    'email',
    'taiKhoanId',
    'vaiTro',
    'soCccd',
  ])(
    'RLD-02 (NT-05, H2) trường lạ %s ⇒ đúng một mục TRUONG_KHONG_DUOC_PHEP của trường đó, không thêm lỗi nào khác',
    async (field) => {
      const errors = await errorsOf({ ...VALID, [field]: 'x' });

      expect(asPairs(errors)).toEqual([`${field}:TRUONG_KHONG_DUOC_PHEP`]);
    },
  );

  it.each(REQUIRED)(
    'RLD-03 (NT-02) thiếu khoá %s ⇒ đúng mã của trường đó',
    async (field) => {
      const errors = await errorsOf(without(field));

      expect(asPairs(errors)).toEqual([`${field}:${FIELD_CODE[field]}`]);
    },
  );

  it('RLD-03b (NT-02) thân {} ⇒ đủ bốn lỗi theo thứ tự khai báo; soDienThoai không bắt buộc nên không có lỗi', async () => {
    expect(asPairs(await errorsOf({}))).toEqual([
      'hoTen:HO_TEN_KHONG_HOP_LE',
      'moiQuanHe:MOI_QUAN_HE_KHONG_HOP_LE',
      'gioiTinh:GIOI_TINH_KHONG_HOP_LE',
      'ngaySinh:NGAY_SINH_KHONG_HOP_LE',
    ]);
  });

  it.each(REQUIRED)(
    'RLD-04 (NT-02) %s: null và chuỗi rỗng đều là lỗi của chính trường đó (bốn trường đầu bắt buộc, không nhận null)',
    async (field) => {
      for (const value of [null, '']) {
        expect(asPairs(await errorsOf({ ...VALID, [field]: value }))).toEqual([
          `${field}:${FIELD_CODE[field]}`,
        ]);
      }
    },
  );

  it('RLD-05 (NT-03) moiQuanHe: cả 8 giá trị qua; Bố, cha, rỗng, null, số ⇒ MOI_QUAN_HE_KHONG_HOP_LE', async () => {
    for (const moiQuanHe of RELATIONSHIPS) {
      expect((await parse({ ...VALID, moiQuanHe })).moiQuanHe).toBe(moiQuanHe);
    }
    for (const moiQuanHe of ['Bố', 'cha', '', null, 5]) {
      expect(asPairs(await errorsOf({ ...VALID, moiQuanHe }))).toEqual([
        'moiQuanHe:MOI_QUAN_HE_KHONG_HOP_LE',
      ]);
    }
  });

  it('RLD-06 (NT-04) soDienThoai tuỳ chọn: thiếu khoá ⇒ undefined; null, rỗng, chỉ khoảng trắng, tab ⇒ null; dấu cách hoặc chấm ⇒ 10 số liền; +84…, 9 số, kiểu số ⇒ SDT_KHONG_HOP_LE', async () => {
    const missing = await parse(without('soDienThoai'));
    expect(missing.soDienThoai).toBeUndefined();

    for (const soDienThoai of [null, '', '   ', '\t']) {
      expect((await parse({ ...VALID, soDienThoai })).soDienThoai).toBeNull();
    }
    for (const soDienThoai of [' 0901 234 567 ', '0901.234.567']) {
      expect((await parse({ ...VALID, soDienThoai })).soDienThoai).toBe(
        '0901234567',
      );
    }
    for (const soDienThoai of ['+84901234567', '090123456', 901234567]) {
      expect(asPairs(await errorsOf({ ...VALID, soDienThoai }))).toEqual([
        'soDienThoai:SDT_KHONG_HOP_LE',
      ]);
    }
  });

  it('RLD-07 (NT-04) ngày sinh: 15/05/1990, 2026-02-30, 1899-12-31, ngày mai theo giờ VN ⇒ NGAY_SINH_KHONG_HOP_LE; 1900-01-01, hôm nay, 2024-02-29 qua', async () => {
    for (const ngaySinh of [
      '15/05/1990',
      '2026-02-30',
      '1899-12-31',
      '2026-11-06',
    ]) {
      expect(asPairs(await errorsOf({ ...VALID, ngaySinh }))).toEqual([
        'ngaySinh:NGAY_SINH_KHONG_HOP_LE',
      ]);
    }
    for (const ngaySinh of ['1900-01-01', '2026-11-05', '2024-02-29']) {
      expect((await parse({ ...VALID, ngaySinh })).ngaySinh).toBe(ngaySinh);
    }
  });

  it('RLD-07b (NT-04) "hôm nay" tính theo giờ Việt Nam: 23:59:59 và 00:00:00 +07:00 quanh nửa đêm', async () => {
    vi.setSystemTime(new Date('2026-11-05T16:59:59.000Z')); // 23:59:59 ngày 05/11 giờ VN
    expect(
      asPairs(await errorsOf({ ...VALID, ngaySinh: '2026-11-06' })),
    ).toEqual(['ngaySinh:NGAY_SINH_KHONG_HOP_LE']);

    vi.setSystemTime(new Date('2026-11-05T17:00:00.000Z')); // 00:00:00 ngày 06/11 giờ VN
    expect((await parse({ ...VALID, ngaySinh: '2026-11-06' })).ngaySinh).toBe(
      '2026-11-06',
    );
  });

  it('RLD-08 (NT-02) giới tính: Nam, Nu, Khac qua; nam, Nữ, rỗng, null, số ⇒ GIOI_TINH_KHONG_HOP_LE', async () => {
    for (const gioiTinh of ['Nam', 'Nu', 'Khac']) {
      expect((await parse({ ...VALID, gioiTinh })).gioiTinh).toBe(gioiTinh);
    }
    for (const gioiTinh of ['nam', 'Nữ', '', null, 1]) {
      expect(asPairs(await errorsOf({ ...VALID, gioiTinh }))).toEqual([
        'gioiTinh:GIOI_TINH_KHONG_HOP_LE',
      ]);
    }
  });

  it('RLD-09 (NT-02) họ tên: NFD thừa khoảng trắng ⇒ NFC đã cắt; rỗng, chỉ khoảng trắng, 101 ký tự, ký tự điều khiển, kiểu số ⇒ HO_TEN_KHONG_HOP_LE', async () => {
    const dto = await parse({
      ...VALID,
      hoTen: '  Nguyễn Văn Thư  ',
    });
    expect(dto.hoTen).toBe('Nguyễn Văn Thư'.normalize('NFC'));

    for (const hoTen of ['', '   ', 'A'.repeat(101), 'Văn\nA', 123]) {
      expect(asPairs(await errorsOf({ ...VALID, hoTen }))).toEqual([
        'hoTen:HO_TEN_KHONG_HOP_LE',
      ]);
    }
  });

  it('RLD-10 nhiều lỗi cùng lúc ⇒ loi[] gồm trường lạ TRƯỚC (theo thứ tự khoá gửi lên), rồi các trường theo thứ tự khai báo', async () => {
    const errors = await errorsOf({
      benhNhanId: '1',
      ngaySinh: 'sai',
      gioiTinh: 'x',
      moiQuanHe: 'y',
      hoTen: '',
      soDienThoai: 'abc',
      diaChi: 'z',
    });

    expect(asPairs(errors)).toEqual([
      'benhNhanId:TRUONG_KHONG_DUOC_PHEP',
      'diaChi:TRUONG_KHONG_DUOC_PHEP',
      'hoTen:HO_TEN_KHONG_HOP_LE',
      'moiQuanHe:MOI_QUAN_HE_KHONG_HOP_LE',
      'gioiTinh:GIOI_TINH_KHONG_HOP_LE',
      'ngaySinh:NGAY_SINH_KHONG_HOP_LE',
      'soDienThoai:SDT_KHONG_HOP_LE',
    ]);
  });

  it('RLD-11 (BM-01) thân lỗi chỉ có maLoi, thongBao, loi (mỗi mục chỉ truong và ma) và KHÔNG lặp lại giá trị đã gửi', async () => {
    const error = await rejectionOf({
      hoTen: '',
      moiQuanHe: 'GIA_TRI_NHAN_DIEN_QH',
      gioiTinh: 'GIA_TRI_NHAN_DIEN_GT',
      ngaySinh: 'GIA_TRI_NHAN_DIEN_NS',
      soDienThoai: 'GIA_TRI_NHAN_DIEN_SDT',
      email: 'GIA_TRI_NHAN_DIEN_EMAIL',
    });
    const body = error.getResponse() as {
      loi: Record<string, unknown>[];
    } & Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual(['loi', 'maLoi', 'thongBao']);
    for (const item of body.loi) {
      expect(Object.keys(item).sort()).toEqual(['ma', 'truong']);
    }
    expect(JSON.stringify(body)).not.toContain('GIA_TRI_NHAN_DIEN');
  });

  it('RLD-12 thân không phải đối tượng (mảng, chuỗi, undefined) ⇒ 400 có mã, không ném lỗi lạ (không 500)', async () => {
    for (const body of [[VALID], 'abc', undefined]) {
      const error = await rejectionOf(body);
      expect(error.getStatus()).toBe(400);
      expect(error.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    }
  });
});
