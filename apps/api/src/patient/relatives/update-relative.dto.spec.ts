import { ValidationPipe } from '@nestjs/common';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import { CreateRelativeDto, UpdateRelativeDto } from './relatives.dto.js';

// Task B4 — `UpdateRelativeDto` (thân của PUT /patient/relatives/:id) qua ĐÚNG cấu hình ValidationPipe của configureApp (app.setup.ts). Luật từng trường đã có
// test ở P1 và B3 (create-relative.dto.spec.ts): ở đây mỗi ý chỉ cần đủ ca chứng minh lớp kế thừa nối đúng và PUT thay cả bộ (TRACKING patient B4-C, B4-G).
// Mã ca RUD-nn là [đề xuất]. Mọi giá trị là dữ liệu giả.
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

const parseAs = (metatype: typeof CreateRelativeDto, body: unknown) =>
  pipe.transform(body, { type: 'body', metatype });
const parse = (body: unknown) =>
  parseAs(UpdateRelativeDto, body) as Promise<UpdateRelativeDto>;

async function rejectionOf(
  body: unknown,
  metatype: typeof CreateRelativeDto = UpdateRelativeDto,
): Promise<AppException> {
  try {
    await parseAs(metatype, body);
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
async function errorsOf(
  body: unknown,
  metatype: typeof CreateRelativeDto = UpdateRelativeDto,
): Promise<FieldError[]> {
  const error = await rejectionOf(body, metatype);
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

// Hôm nay cố định là 05/11/2026 giờ VN (12:00 +07:00)
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T05:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UpdateRelativeDto qua ValidationPipe của configureApp', () => {
  it('RUD-01 (NT-07) thân hợp lệ đủ năm trường ⇒ UpdateRelativeDto (cũng là CreateRelativeDto) với đúng năm giá trị, không thêm khoá', async () => {
    const dto = await parse(VALID);

    expect(dto).toBeInstanceOf(UpdateRelativeDto);
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
    'RUD-02 (NT-05, H2) thân có trường lạ %s ⇒ đúng một mục TRUONG_KHONG_DUOC_PHEP của trường đó',
    async (field) => {
      const errors = await errorsOf({ ...VALID, [field]: 'x' });

      expect(asPairs(errors)).toEqual([`${field}:TRUONG_KHONG_DUOC_PHEP`]);
    },
  );

  it.each(REQUIRED)(
    'RUD-03 (NT-02) PUT thay cả bộ: thiếu khoá bắt buộc %s ⇒ đúng mã của trường đó',
    async (field) => {
      expect(asPairs(await errorsOf(without(field)))).toEqual([
        `${field}:${FIELD_CODE[field]}`,
      ]);
    },
  );

  it('RUD-03b (NT-02) thân {} ⇒ bốn lỗi theo thứ tự khai báo (soDienThoai không bắt buộc nên không có lỗi)', async () => {
    expect(asPairs(await errorsOf({}))).toEqual([
      'hoTen:HO_TEN_KHONG_HOP_LE',
      'moiQuanHe:MOI_QUAN_HE_KHONG_HOP_LE',
      'gioiTinh:GIOI_TINH_KHONG_HOP_LE',
      'ngaySinh:NGAY_SINH_KHONG_HOP_LE',
    ]);
  });

  it('RUD-04 (NT-04) soDienThoai: thiếu khoá ⇒ undefined; null, chuỗi rỗng, chỉ khoảng trắng, tab ⇒ null (controller đổi undefined thành null ⇒ XOÁ SĐT)', async () => {
    expect((await parse(without('soDienThoai'))).soDienThoai).toBeUndefined();
    for (const empty of [null, '', '   ', '\t']) {
      expect(
        (await parse({ ...VALID, soDienThoai: empty })).soDienThoai,
      ).toBeNull();
    }
  });

  it('RUD-04b (NT-04) soDienThoai có nhập: bỏ dấu cách, dấu chấm thành 10 số liền; sai dạng ⇒ SDT_KHONG_HOP_LE', async () => {
    expect(
      (await parse({ ...VALID, soDienThoai: '0901 234 567' })).soDienThoai,
    ).toBe('0901234567');
    for (const bad of ['+84901234567', '090123456', 901234567]) {
      expect(asPairs(await errorsOf({ ...VALID, soDienThoai: bad }))).toEqual([
        'soDienThoai:SDT_KHONG_HOP_LE',
      ]);
    }
  });

  it.each([
    ['moiQuanHe', 'Bố'],
    ['gioiTinh', 'nam'],
    ['ngaySinh', '15/05/1990'],
    ['ngaySinh', '2026-11-06'], // ngày mai theo giờ VN
    ['hoTen', '   '],
  ] as const)(
    'RUD-05 (NT-03, NT-04) trường %s nhận %j ⇒ đúng mã của trường đó',
    async (field, value) => {
      expect(asPairs(await errorsOf({ ...VALID, [field]: value }))).toEqual([
        `${field}:${FIELD_CODE[field]}`,
      ]);
    },
  );

  it('RUD-06 nhiều lỗi cùng lúc ⇒ loi[] GIỐNG HỆT CreateRelativeDto với cùng thân (trường lạ trước theo thứ tự gửi, rồi các trường theo thứ tự khai báo)', async () => {
    const body = {
      zzLa: 1,
      moiQuanHe: 'Bố',
      ngaySinh: '15/05/1990',
      soDienThoai: '123',
      email: 'x@clinix.invalid',
    };

    const forUpdate = await errorsOf(body, UpdateRelativeDto);
    const forCreate = await errorsOf(body, CreateRelativeDto);

    expect(forUpdate).toStrictEqual(forCreate);
    expect(asPairs(forUpdate)).toEqual([
      'zzLa:TRUONG_KHONG_DUOC_PHEP',
      'email:TRUONG_KHONG_DUOC_PHEP',
      'hoTen:HO_TEN_KHONG_HOP_LE',
      'moiQuanHe:MOI_QUAN_HE_KHONG_HOP_LE',
      'gioiTinh:GIOI_TINH_KHONG_HOP_LE',
      'ngaySinh:NGAY_SINH_KHONG_HOP_LE',
      'soDienThoai:SDT_KHONG_HOP_LE',
    ]);
  });

  it('RUD-07 (BM-01) thân 400 chỉ có maLoi, thongBao, loi; mỗi mục chỉ truong và ma; KHÔNG lặp lại giá trị đã gửi', async () => {
    const error = await rejectionOf({
      hoTen: 'ZQXHOTEN',
      moiQuanHe: 'ZQXQUANHE',
      gioiTinh: 'ZQXGIOI',
      ngaySinh: 'ZQXNGAY',
      soDienThoai: 'ZQXSDT',
      email: 'ZQXMAIL',
    });

    const response = error.getResponse() as {
      loi: Record<string, unknown>[];
    };
    expect(Object.keys(response).sort()).toEqual(['loi', 'maLoi', 'thongBao']);
    for (const item of response.loi) {
      expect(Object.keys(item).sort()).toEqual(['ma', 'truong']);
    }
    expect(JSON.stringify(response)).not.toContain('ZQX');
  });

  it.each([[[]], ['chuỗi'], [undefined], [null]])(
    'RUD-08 thân không phải đối tượng (%j) ⇒ 400 có mã, không lỗi lạ',
    async (body) => {
      const error = await rejectionOf(body);

      expect(error.getStatus()).toBe(400);
      expect(error.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    },
  );
});
