import { ValidationPipe } from '@nestjs/common';
import {
  AppException,
  type ErrorBody,
  type FieldError,
} from '../../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../../common/errors/validation-exception.js';
import {
  LOAI_TAI_KHOAN,
  TRANG_THAI_TAI_KHOAN,
} from '../../../auth/entities/enums.js';
import { AccountIdDto, AccountListDto } from '../account.dto.js';

// Cùng cấu hình với ValidationPipe toàn cục của app (app.setup.ts).
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const parseQuery = (query: Record<string, unknown>) =>
  pipe.transform(query, {
    type: 'query',
    metatype: AccountListDto,
    data: undefined,
  }) as Promise<AccountListDto>;

const parseId = (id: unknown) =>
  pipe.transform(
    { id },
    {
      type: 'param',
      metatype: AccountIdDto,
      data: undefined,
    },
  ) as Promise<AccountIdDto>;

async function fieldErrors(work: Promise<unknown>): Promise<FieldError[]> {
  const error = await work.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppException);
  const exception = error as AppException;
  expect(exception.getStatus()).toBe(400);
  expect(exception.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
  return (exception.getResponse() as ErrorBody).loi ?? [];
}

describe('TKB17-01 (TK-05, SE-A2, SE-A10) — DTO lọc danh sách tài khoản', () => {
  it('mặc định: trang 1, 20 dòng, không bộ lọc nào', async () => {
    const dto = await parseQuery({});
    expect(dto).toMatchObject({ page: 1, pageSize: 20, offset: 0 });
    expect(dto.vaiTro).toBeUndefined();
    expect(dto.trangThai).toBeUndefined();
    expect(dto.khoaNoShow).toBeUndefined();
    expect(dto.chiNhanhId).toBeUndefined();
    expect(dto.q).toBeUndefined();
  });

  describe('vaiTro', () => {
    it.each(LOAI_TAI_KHOAN)(
      'nhận giá trị %s (một giá trị thành mảng)',
      async (loai) => {
        expect((await parseQuery({ vaiTro: loai })).vaiTro).toEqual([loai]);
      },
    );

    it('nhận nhiều giá trị lặp tham số (tab Nhân sự của F8)', async () => {
      const dto = await parseQuery({
        vaiTro: ['BacSi', 'LeTan', 'QuanTriVien'],
      });
      expect(dto.vaiTro).toEqual(['BacSi', 'LeTan', 'QuanTriVien']);
    });

    it('nhận đủ bốn giá trị', async () => {
      expect(
        (await parseQuery({ vaiTro: [...LOAI_TAI_KHOAN] })).vaiTro,
      ).toEqual([...LOAI_TAI_KHOAN]);
    });

    it.each([
      ['ngoài danh sách', 'Admin'],
      ['sai hoa thường', 'bacsi'],
      ['chuỗi rỗng', ''],
      ['mảng rỗng', []],
      ['mảng có phần tử rỗng', ['']],
      ['giá trị trùng', ['BacSi', 'BacSi']],
      ['một giá trị lạ trong mảng', ['BacSi', 'Admin']],
      ['dạng đối tượng (vaiTro[a]=b)', { a: 'b' }],
    ])('từ chối %s bằng VAI_TRO_KHONG_HOP_LE', async (_name, value) => {
      const errors = await fieldErrors(parseQuery({ vaiTro: value }));
      expect(errors).toContainEqual({
        truong: 'vaiTro',
        ma: 'VAI_TRO_KHONG_HOP_LE',
      });
    });
  });

  describe('trangThai', () => {
    it.each(TRANG_THAI_TAI_KHOAN)('nhận %s', async (value) => {
      expect((await parseQuery({ trangThai: value })).trangThai).toBe(value);
    });

    it.each([
      ['giá trị lạ', 'x'],
      ['chuỗi rỗng', ''],
      ['sai hoa thường', 'dangHoatDong'],
      ['hai giá trị', ['DangHoatDong', 'NgungHoatDong']],
    ])('từ chối %s bằng TRANG_THAI_KHONG_HOP_LE', async (_name, value) => {
      expect(
        await fieldErrors(parseQuery({ trangThai: value })),
      ).toContainEqual({
        truong: 'trangThai',
        ma: 'TRANG_THAI_KHONG_HOP_LE',
      });
    });
  });

  describe('khoaNoShow', () => {
    it.each(['true', 'false'])('nhận %s', async (value) => {
      expect((await parseQuery({ khoaNoShow: value })).khoaNoShow).toBe(value);
    });

    it.each(['TRUE', 'False', '1', '0', 'yes', '', 'null'])(
      'từ chối "%s" bằng KHOA_NO_SHOW_KHONG_HOP_LE',
      async (value) => {
        expect(
          await fieldErrors(parseQuery({ khoaNoShow: value })),
        ).toContainEqual({
          truong: 'khoaNoShow',
          ma: 'KHOA_NO_SHOW_KHONG_HOP_LE',
        });
      },
    );
  });

  describe('chiNhanhId', () => {
    it.each(['1', '42', '9223372036854775807'])('nhận %s', async (value) => {
      expect((await parseQuery({ chiNhanhId: value })).chiNhanhId).toBe(value);
    });

    it.each([
      '0',
      '-1',
      '01',
      'abc',
      '1e3',
      '1.5',
      ' 1',
      '',
      '9223372036854775808',
      '99999999999999999999',
    ])('từ chối "%s" bằng MA_CHI_NHANH_KHONG_HOP_LE', async (value) => {
      expect(
        await fieldErrors(parseQuery({ chiNhanhId: value })),
      ).toContainEqual({
        truong: 'chiNhanhId',
        ma: 'MA_CHI_NHANH_KHONG_HOP_LE',
      });
    });
  });

  describe('q (SE-A10)', () => {
    it('cắt khoảng trắng hai đầu', async () => {
      expect((await parseQuery({ q: '  an  ' })).q).toBe('an');
    });

    it('chuỗi chỉ có khoảng trắng thành chuỗi rỗng (service bỏ qua)', async () => {
      expect((await parseQuery({ q: '   ' })).q).toBe('');
    });

    it('nhận đúng 200 ký tự, cả khi có khoảng trắng thừa ngoài 200', async () => {
      expect((await parseQuery({ q: 'a'.repeat(200) })).q).toHaveLength(200);
      expect((await parseQuery({ q: ` ${'a'.repeat(200)} ` })).q).toHaveLength(
        200,
      );
    });

    it('từ chối 201 ký tự bằng TU_KHOA_QUA_DAI', async () => {
      expect(
        await fieldErrors(parseQuery({ q: 'a'.repeat(201) })),
      ).toContainEqual({ truong: 'q', ma: 'TU_KHOA_QUA_DAI' });
    });

    it('từ chối dạng mảng bằng TU_KHOA_KHONG_HOP_LE', async () => {
      expect(await fieldErrors(parseQuery({ q: ['a', 'b'] }))).toContainEqual({
        truong: 'q',
        ma: 'TU_KHOA_KHONG_HOP_LE',
      });
    });

    it.each(['%', '_', '!', "'", '--', '"; DROP TABLE tai_khoan; --'])(
      'giữ nguyên ký tự đặc biệt %s (escape làm ở repository, không ở DTO)',
      async (value) => {
        expect((await parseQuery({ q: value })).q).toBe(value);
      },
    );
  });

  it.each(['sort', 'order', 'loai', 'matKhauBam', 'trangThaiHoatDong', 'id'])(
    'từ chối trường lạ "%s" bằng TRUONG_KHONG_DUOC_PHEP',
    async (name) => {
      expect(await fieldErrors(parseQuery({ [name]: 'x' }))).toContainEqual({
        truong: name,
        ma: 'TRUONG_KHONG_DUOC_PHEP',
      });
    },
  );
});

describe('TKB17-02 (TK-05) — DTO id tài khoản', () => {
  it.each(['1', '123', '9223372036854775807'])('nhận %s', async (id) => {
    expect((await parseId(id)).id).toBe(id);
  });

  it.each([
    '0',
    '-1',
    '01',
    'abc',
    '1e3',
    '1.5',
    ' 1',
    '1 ',
    '',
    '9223372036854775808',
    '123456789012345678901',
    '1;DROP TABLE tai_khoan',
  ])('từ chối "%s" bằng MA_TAI_KHOAN_KHONG_HOP_LE', async (id) => {
    expect(await fieldErrors(parseId(id))).toContainEqual({
      truong: 'id',
      ma: 'MA_TAI_KHOAN_KHONG_HOP_LE',
    });
  });

  it('từ chối id không phải chuỗi', async () => {
    expect(await fieldErrors(parseId(5))).toContainEqual({
      truong: 'id',
      ma: 'MA_TAI_KHOAN_KHONG_HOP_LE',
    });
  });
});

describe('TKB17-03 (TK-05) — phân trang biên qua DTO của B17', () => {
  it.each([
    ['page = 0', { page: '0' }],
    ['page âm', { page: '-1' }],
    ['page thập phân', { page: '1.5' }],
    ['page là chữ', { page: 'abc' }],
    ['pageSize = 0', { pageSize: '0' }],
    ['pageSize = 101', { pageSize: '101' }],
    ['pageSize âm', { pageSize: '-1' }],
    ['pageSize là chữ', { pageSize: 'abc' }],
    ['pageSize dạng khoa học vượt 100', { pageSize: '1e3' }],
  ])('từ chối %s bằng 400 DU_LIEU_KHONG_HOP_LE', async (_name, query) => {
    const errors = await fieldErrors(parseQuery(query));
    expect(errors.length).toBeGreaterThan(0);
  });

  it.each([
    ['1', 1],
    ['100', 100],
  ])('nhận pageSize biên %s', async (value, expected) => {
    expect((await parseQuery({ pageSize: value })).pageSize).toBe(expected);
  });

  it('tính offset từ page và pageSize', async () => {
    expect((await parseQuery({ page: '3', pageSize: '25' })).offset).toBe(50);
  });
});
