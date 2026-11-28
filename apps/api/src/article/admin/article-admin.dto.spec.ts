import { ValidationPipe, type Type } from '@nestjs/common';
import type { FieldError } from '../../common/errors/app.exception.js';
import type { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import {
  ArticleIdDto,
  ArticleListQueryDto,
  CreateArticleDto,
  HashtagSuggestQueryDto,
  UpdateArticleDto,
} from './article-admin.dto.js';

// article B1: kiểm DTO bằng đúng cấu hình ValidationPipe của app thật (app.setup.ts): trường lạ bị từ chối, lỗi thành 400 `DU_LIEU_KHONG_HOP_LE` kèm `loi[{truong, ma}]`.
// Phủ phần dữ liệu vào của ABQ-06 (khoá lạ), ABV-02 (tiêu đề), ABV-04 (trạng thái), ABV-10 (id), ABV-11 (mô tả), ABN-02, ABN-03 (nội dung), ABT-02, ABT-03 (thẻ).
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

type Where = 'body' | 'query' | 'param';

async function parse<T extends object>(
  metatype: Type<T>,
  value: unknown,
  type: Where = 'body',
): Promise<T> {
  return (await pipe.transform(value, { type, metatype })) as T;
}

/** Danh sách `loi[{truong, ma}]` khi DTO bị từ chối; rỗng nếu hợp lệ. */
async function errorsOf<T extends object>(
  metatype: Type<T>,
  value: unknown,
  type: Where = 'body',
): Promise<FieldError[]> {
  try {
    await parse(metatype, value, type);
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

const valid = {
  tieuDe: 'Sốt xuất huyết',
  noiDung: 'Nội dung',
  hashtag: ['ho'],
  trangThai: 'BanNhap',
};
const tags = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `the${index}`);

describe('article — DTO tạo bài', () => {
  it('hợp lệ: chuẩn hoá tiêu đề (NFC, gộp khoảng trắng), mô tả rỗng thành null, nội dung `\\r\\n` thành `\\n`, thẻ giữ nguyên để service chuẩn hoá', async () => {
    const dto = await parse(CreateArticleDto, {
      ...valid,
      tieuDe: '  Sốt   xuất\thuyết '.normalize('NFD'),
      moTaNgan: '   ',
      noiDung: 'a\r\nb',
      hashtag: ['  #Ho '],
    });
    expect(dto.tieuDe).toBe('Sốt xuất huyết');
    expect(dto.moTaNgan).toBeNull();
    expect(dto.noiDung).toBe('a\nb');
    expect(dto.hashtag).toEqual(['  #Ho ']);
  });

  it('ABV-02: tiêu đề thiếu, rỗng, toàn khoảng trắng, kiểu sai, 256 ký tự: TIEU_DE_KHONG_HOP_LE ở trường tieuDe; 255 nhận', async () => {
    for (const bad of [undefined, '', '  \t ', 5, 'a'.repeat(256)]) {
      expect(
        await errorsOf(CreateArticleDto, { ...valid, tieuDe: bad }),
        String(bad),
      ).toEqual([{ truong: 'tieuDe', ma: 'TIEU_DE_KHONG_HOP_LE' }]);
    }
    expect(
      await errorsOf(CreateArticleDto, { ...valid, tieuDe: 'a'.repeat(255) }),
    ).toEqual([]);
  });

  it('ABV-11: mô tả 500 nhận, 501 MO_TA_QUA_DAI; null và rỗng nhận; kiểu sai hay ký tự điều khiển là MO_TA_KHONG_HOP_LE', async () => {
    const base = { ...valid };
    expect(
      await errorsOf(CreateArticleDto, { ...base, moTaNgan: 'a'.repeat(500) }),
    ).toEqual([]);
    expect(
      await errorsOf(CreateArticleDto, { ...base, moTaNgan: 'a'.repeat(501) }),
    ).toEqual([{ truong: 'moTaNgan', ma: 'MO_TA_QUA_DAI' }]);
    expect(
      await errorsOf(CreateArticleDto, { ...base, moTaNgan: null }),
    ).toEqual([]);
    expect(await errorsOf(CreateArticleDto, { ...base, moTaNgan: '' })).toEqual(
      [],
    );
    for (const bad of [5, 'a\x00b'])
      expect(
        await errorsOf(CreateArticleDto, { ...base, moTaNgan: bad }),
        String(bad),
      ).toEqual([{ truong: 'moTaNgan', ma: 'MO_TA_KHONG_HOP_LE' }]);
  });

  it('ABN-02 và ABN-03: nội dung thiếu hay kiểu sai, ký tự điều khiển là NOI_DUNG_KHONG_HOP_LE; 20.001 ký tự và 16.000 emoji là NOI_DUNG_QUA_DAI; 20.000 và rỗng nhận', async () => {
    for (const bad of [undefined, 5, 'a\x00b', 'a\rb'])
      expect(
        await errorsOf(CreateArticleDto, { ...valid, noiDung: bad }),
        String(bad),
      ).toEqual([{ truong: 'noiDung', ma: 'NOI_DUNG_KHONG_HOP_LE' }]);
    for (const bad of ['a'.repeat(20_001), '😀'.repeat(16_000)])
      expect(
        await errorsOf(CreateArticleDto, { ...valid, noiDung: bad }),
        String(bad.length),
      ).toEqual([{ truong: 'noiDung', ma: 'NOI_DUNG_QUA_DAI' }]);
    for (const good of ['', 'a'.repeat(20_000), 'ệ'.repeat(20_000)])
      expect(
        await errorsOf(CreateArticleDto, { ...valid, noiDung: good }),
        String(good.length),
      ).toEqual([]);
  });

  it('ABT-02 và ABT-03: thẻ sai ký tự, kiểu sai, thiếu là THE_KHONG_HOP_LE; 10 thẻ khác nhau nhận, 11 là QUA_NHIEU_THE; Ho và ho gộp (11 phần tử thô nhưng 10 thẻ vẫn nhận); trần thô 51 phần tử', async () => {
    for (const bad of [undefined, 'ho', [5], ['a/b'], ['ho', '<'], ['']])
      expect(
        await errorsOf(CreateArticleDto, { ...valid, hashtag: bad }),
        JSON.stringify(bad),
      ).toEqual([{ truong: 'hashtag', ma: 'THE_KHONG_HOP_LE' }]);
    expect(
      await errorsOf(CreateArticleDto, { ...valid, hashtag: tags(10) }),
    ).toEqual([]);
    expect(
      await errorsOf(CreateArticleDto, { ...valid, hashtag: tags(11) }),
    ).toEqual([{ truong: 'hashtag', ma: 'QUA_NHIEU_THE' }]);
    expect(
      await errorsOf(CreateArticleDto, {
        ...valid,
        hashtag: [...tags(10), 'THE0'],
      }),
    ).toEqual([]);
    expect(
      await errorsOf(CreateArticleDto, {
        ...valid,
        hashtag: Array(51).fill('ho'),
      }),
    ).toEqual([{ truong: 'hashtag', ma: 'QUA_NHIEU_THE' }]);
    expect(await errorsOf(CreateArticleDto, { ...valid, hashtag: [] })).toEqual(
      [],
    );
  });

  it('ABV-04: trạng thái thiếu hay lạ là TRANG_THAI_KHONG_HOP_LE ở DTO; LuuTruAn qua DTO (service từ chối bằng 400 riêng)', async () => {
    for (const bad of [undefined, 'Foo', 5])
      expect(
        await errorsOf(CreateArticleDto, { ...valid, trangThai: bad }),
        String(bad),
      ).toEqual([{ truong: 'trangThai', ma: 'TRANG_THAI_KHONG_HOP_LE' }]);
    expect(
      await errorsOf(CreateArticleDto, { ...valid, trangThai: 'LuuTruAn' }),
    ).toEqual([]);
  });

  it('ABQ-06: khoá lạ (tacGiaId, thoiDiemXuatBan, baiVietId, anhDaiDien, imageUploadId) bị từ chối từng khoá, kèm TRUONG_KHONG_DUOC_PHEP', async () => {
    for (const key of [
      'tacGiaId',
      'thoiDiemXuatBan',
      'baiVietId',
      'anhDaiDien',
      'imageUploadId',
      'capNhatLanCuoi',
    ]) {
      expect(
        await errorsOf(CreateArticleDto, { ...valid, [key]: 'x' }),
        key,
      ).toEqual([{ truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' }]);
      expect(
        await errorsOf(UpdateArticleDto, { tieuDe: 'a', [key]: 'x' }),
        key,
      ).toEqual([{ truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' }]);
    }
  });

  it('nhiều lỗi cùng một lượt: tiêu đề, nội dung và thẻ cùng sai thì báo đủ ba trường', async () => {
    const found = await errorsOf(CreateArticleDto, {
      ...valid,
      tieuDe: '',
      noiDung: 'a'.repeat(20_001),
      hashtag: ['a/b'],
    });
    expect(found).toEqual(
      expect.arrayContaining([
        { truong: 'tieuDe', ma: 'TIEU_DE_KHONG_HOP_LE' },
        { truong: 'noiDung', ma: 'NOI_DUNG_QUA_DAI' },
        { truong: 'hashtag', ma: 'THE_KHONG_HOP_LE' },
      ]),
    );
    expect(found).toHaveLength(3);
  });
});

describe('article — DTO sửa bài (PATCH)', () => {
  it('thân rỗng qua DTO (service từ chối bằng 400 riêng); từng khoá vắng thì giữ nguyên (undefined)', async () => {
    const dto = await parse(UpdateArticleDto, {});
    expect(dto).toEqual({});
    expect(dto.moTaNgan).toBeUndefined();
  });

  it('ABV-11: moTaNgan null hay rỗng nghĩa là xoá mô tả (null); khoá khác vẫn được kiểm khi có mặt', async () => {
    expect(
      (await parse(UpdateArticleDto, { moTaNgan: null })).moTaNgan,
    ).toBeNull();
    expect(
      (await parse(UpdateArticleDto, { moTaNgan: ' ' })).moTaNgan,
    ).toBeNull();
    expect(await errorsOf(UpdateArticleDto, { tieuDe: '' })).toEqual([
      { truong: 'tieuDe', ma: 'TIEU_DE_KHONG_HOP_LE' },
    ]);
    expect(await errorsOf(UpdateArticleDto, { tieuDe: null })).toEqual([
      { truong: 'tieuDe', ma: 'TIEU_DE_KHONG_HOP_LE' },
    ]);
    expect(await errorsOf(UpdateArticleDto, { hashtag: ['a/b'] })).toEqual([
      { truong: 'hashtag', ma: 'THE_KHONG_HOP_LE' },
    ]);
    expect(await errorsOf(UpdateArticleDto, { hashtag: [] })).toEqual([]);
    expect(await errorsOf(UpdateArticleDto, { trangThai: 'LuuTruAn' })).toEqual(
      [],
    );
    expect(await errorsOf(UpdateArticleDto, { trangThai: 'Foo' })).toEqual([
      { truong: 'trangThai', ma: 'TRANG_THAI_KHONG_HOP_LE' },
    ]);
  });
});

describe('article — DTO id và truy vấn', () => {
  it('ABV-10: id là số nguyên dương trong khoảng BIGINT dạng chuỗi; abc, 0, -1, 01, 20 chữ số, số thập phân bị MA_BAI_VIET_KHONG_HOP_LE', async () => {
    for (const good of ['1', '12', '9223372036854775807'])
      expect(await errorsOf(ArticleIdDto, { id: good }, 'param'), good).toEqual(
        [],
      );
    for (const bad of [
      'abc',
      '0',
      '-1',
      '01',
      '1.5',
      '9223372036854775808',
      '99999999999999999999',
      '',
    ])
      expect(await errorsOf(ArticleIdDto, { id: bad }, 'param'), bad).toEqual([
        { truong: 'id', ma: 'MA_BAI_VIET_KHONG_HOP_LE' },
      ]);
  });

  it('ABV-12: danh sách: q được trim, trangThai và the được kiểm, phân trang mặc định 20 và tối đa 100; khoá lạ bị từ chối', async () => {
    const dto = await parse(
      ArticleListQueryDto,
      {
        q: '  sốt  ',
        trangThai: 'DaXuatBan',
        the: 'Trẻ Em',
        page: '2',
        pageSize: '5',
      },
      'query',
    );
    expect(dto.q).toBe('sốt');
    expect(dto.trangThai).toBe('DaXuatBan');
    expect(dto.page).toBe(2);
    expect(dto.offset).toBe(5);
    const defaults = await parse(ArticleListQueryDto, {}, 'query');
    expect(defaults.page).toBe(1);
    expect(defaults.pageSize).toBe(20);
    expect(
      (await errorsOf(ArticleListQueryDto, { trangThai: 'Foo' }, 'query')).map(
        (e) => e.ma,
      ),
    ).toEqual(['TRANG_THAI_KHONG_HOP_LE']);
    expect(
      await errorsOf(ArticleListQueryDto, { the: 'a/b' }, 'query'),
    ).toEqual([{ truong: 'the', ma: 'THE_KHONG_HOP_LE' }]);
    expect(
      await errorsOf(ArticleListQueryDto, { q: 'a'.repeat(101) }, 'query'),
    ).toEqual([{ truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' }]);
    expect(
      (await errorsOf(ArticleListQueryDto, { pageSize: '101' }, 'query')).map(
        (e) => e.truong,
      ),
    ).toEqual(['pageSize']);
    expect(await errorsOf(ArticleListQueryDto, { khac: '1' }, 'query')).toEqual(
      [{ truong: 'khac', ma: 'TRUONG_KHONG_DUOC_PHEP' }],
    );
  });

  it('ABT-08: gợi ý thẻ: limit mặc định 10, tối đa 10; q tối đa 100 ký tự', async () => {
    expect((await parse(HashtagSuggestQueryDto, {}, 'query')).limit).toBe(10);
    expect(
      (await parse(HashtagSuggestQueryDto, { limit: '3' }, 'query')).limit,
    ).toBe(3);
    for (const bad of ['0', '11', 'x'])
      expect(
        [
          ...new Set(
            (
              await errorsOf(HashtagSuggestQueryDto, { limit: bad }, 'query')
            ).map((e) => e.truong),
          ),
        ],
        bad,
      ).toEqual(['limit']);
    expect(
      await errorsOf(HashtagSuggestQueryDto, { q: 'a'.repeat(101) }, 'query'),
    ).toEqual([{ truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' }]);
  });
});
