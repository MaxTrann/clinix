import { ValidationPipe, type Type } from '@nestjs/common';
import type {
  AppException,
  FieldError,
} from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import { PublicArticleListQueryDto } from './public-article.dto.js';

// article B2: kiểm DTO query của danh sách công khai bằng đúng cấu hình ValidationPipe của app thật (app.setup.ts). Phủ phần dữ liệu vào của ABP-02 (phân trang), ABP-03 (`q`),
// ABP-04 (hai `the`) và ABP-11 / ABQ-04 (khoá lạ, nhất là `trangThai`). `the` sai DẠNG không kiểm ở DTO mà ở service (400 BO_LOC_KHONG_HOP_LE, xem `public-article.service.spec.ts`).
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

async function parse<T extends object>(
  metatype: Type<T>,
  value: unknown,
): Promise<T> {
  return (await pipe.transform(value, { type: 'query', metatype })) as T;
}

/** Danh sách `loi[{truong, ma}]` khi DTO bị từ chối; rỗng nếu hợp lệ. */
async function errorsOf(value: unknown): Promise<FieldError[]> {
  try {
    await parse(PublicArticleListQueryDto, value);
    return [];
  } catch (error) {
    const body = (error as AppException).getResponse() as {
      maLoi: string;
      loi: FieldError[];
    };
    expect(body.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    return body.loi;
  }
}

describe('article B2 — DTO danh sách công khai', () => {
  it('ABP-02: không tham số thì page 1, pageSize 9 (không phải 20 của admin), offset 0, không q, không the', async () => {
    const dto = await parse(PublicArticleListQueryDto, {});
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(9);
    expect(dto.offset).toBe(0);
    expect(dto.q).toBeUndefined();
    expect(dto.the).toBeUndefined();
  });

  it('ABP-02: pageSize 1 và 30 nhận; offset = (page - 1) × pageSize', async () => {
    expect(
      (await parse(PublicArticleListQueryDto, { pageSize: '30' })).pageSize,
    ).toBe(30);
    expect(
      (await parse(PublicArticleListQueryDto, { pageSize: '1' })).pageSize,
    ).toBe(1);
    expect(
      (await parse(PublicArticleListQueryDto, { page: '3', pageSize: '9' }))
        .offset,
    ).toBe(18);
  });

  it.each([
    ['31 (quá tối đa 30)', '31', 'MAX'],
    ['100 (tối đa của admin, ở đây quá)', '100', 'MAX'],
    ['0', '0', 'MIN'],
    ['âm', '-1', 'MIN'],
    ['rỗng (thành 0)', '', 'MIN'],
    ['chữ', 'abc', 'IS_INT'],
    ['số thập phân', '9.5', 'IS_INT'],
  ])(
    'ABP-02: pageSize %s ⇒ 400 ở trường pageSize',
    async (_name, value, code) => {
      expect(await errorsOf({ pageSize: value })).toContainEqual({
        truong: 'pageSize',
        ma: code,
      });
    },
  );

  it.each([
    ['0', '0', 'MIN'],
    ['âm', '-3', 'MIN'],
    ['chữ', 'abc', 'IS_INT'],
    ['số thập phân', '1.5', 'IS_INT'],
  ])('ABP-02: page %s ⇒ 400 ở trường page', async (_name, value, code) => {
    expect(await errorsOf({ page: value })).toContainEqual({
      truong: 'page',
      ma: code,
    });
  });

  it('ABP-02: page rất lớn qua được DTO (offset vượt số nguyên an toàn do service từ chối bằng TRANG_KHONG_HOP_LE)', async () => {
    const dto = await parse(PublicArticleListQueryDto, { page: '1e20' });
    expect(Number.isSafeInteger(dto.offset)).toBe(false);
  });

  it('ABP-03: q được cắt khoảng trắng hai đầu và chuẩn hoá NFC; q chỉ khoảng trắng thành rỗng (không lọc)', async () => {
    const dto = await parse(PublicArticleListQueryDto, {
      q: '  Trẻ em '.normalize('NFD'),
    });
    expect(dto.q).toBe('Trẻ em');
    expect(dto.q).toBe('Trẻ em'.normalize('NFC'));
    expect((await parse(PublicArticleListQueryDto, { q: '   ' })).q).toBe('');
  });

  it('ABP-03: q 100 ký tự nhận, 101 ⇒ TU_KHOA_KHONG_HOP_LE ở trường q; q lặp hai lần (mảng) cũng bị từ chối', async () => {
    expect(await errorsOf({ q: 'a'.repeat(100) })).toEqual([]);
    expect(await errorsOf({ q: 'a'.repeat(101) })).toEqual([
      { truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' },
    ]);
    // 100 ký tự thật sự là 100 SAU khi cắt khoảng trắng (không đếm khoảng trắng thừa ở hai đầu)
    expect(await errorsOf({ q: ` ${'a'.repeat(100)} ` })).toEqual([]);
    expect(await errorsOf({ q: ['a', 'b'] })).toContainEqual({
      truong: 'q',
      ma: 'TU_KHOA_KHONG_HOP_LE',
    });
  });

  it('ABP-04: the là MỘT chuỗi (giữ nguyên, service mới chuẩn hoá); hai the (mảng) ⇒ THE_KHONG_HOP_LE ở trường the', async () => {
    expect((await parse(PublicArticleListQueryDto, { the: ' #Ho ' })).the).toBe(
      ' #Ho ',
    );
    expect(await errorsOf({ the: ['ho', 'sot'] })).toEqual([
      { truong: 'the', ma: 'THE_KHONG_HOP_LE' },
    ]);
  });

  it('ABP-11 và ABQ-04: khoá lạ (trangThai, tacGiaId, sapXep, chiNhanhId) bị từ chối TỪNG khoá bằng TRUONG_KHONG_DUOC_PHEP', async () => {
    for (const key of ['trangThai', 'tacGiaId', 'sapXep', 'chiNhanhId']) {
      expect(await errorsOf({ [key]: 'BanNhap' })).toEqual([
        { truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' },
      ]);
    }
    // khoá hợp lệ cùng khoá lạ: chỉ khoá lạ bị báo
    expect(await errorsOf({ q: 'sot', trangThai: 'BanNhap' })).toEqual([
      { truong: 'trangThai', ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
  });
});
