import { UnexpectedResponseError } from '../../../shared/api/errors';
import { makePublicItem } from '../testing/article-fixtures';
import {
  parsePublicArticleDetail,
  parseRatingChoice,
  parseRatingResult,
} from './parse-article';

// article F3: bộ kiểm hình dạng của hợp đồng đánh giá (PLAN 5.7 "Đánh giá (B3)"). ABU-12: chi tiết công khai nay có 9 khoá, hai số đếm là khoá CẦN (số nguyên không âm);
// ABU-09: thân của `GET`, `PUT`, `DELETE …/rating`. Thiếu hay sai kiểu ⇒ `UnexpectedResponseError` để trang hiện `ErrorState` thay vì trắng trang.
const detail = (extra: Record<string, unknown> = {}) => ({
  ...makePublicItem({ baiVietId: '12' }),
  noiDung: 'Nội dung bài',
  luotThich: 3,
  luotKhongThich: 1,
  ...extra,
});

describe('parsePublicArticleDetail: hai số đếm của B3 (ABU-12)', () => {
  it('ABU-12 đủ 9 khoá ⇒ đọc đúng hai số đếm', () => {
    const parsed = parsePublicArticleDetail(detail());
    expect(parsed.luotThich).toBe(3);
    expect(parsed.luotKhongThich).toBe(1);
    expect(Object.keys(parsed)).toHaveLength(9);
  });

  it('ABU-12 biên: 0 và 0 (chưa ai bấm) hợp lệ; số lớn hợp lệ', () => {
    expect(
      parsePublicArticleDetail(detail({ luotThich: 0, luotKhongThich: 0 })),
    ).toMatchObject({ luotThich: 0, luotKhongThich: 0 });
    expect(
      parsePublicArticleDetail(detail({ luotThich: 1_000_000 })).luotThich,
    ).toBe(1_000_000);
  });

  it.each([
    ['thiếu luotThich', { luotThich: undefined }],
    ['thiếu luotKhongThich', { luotKhongThich: undefined }],
    ['luotThich là chuỗi', { luotThich: '3' }],
    ['luotKhongThich là chuỗi', { luotKhongThich: '1' }],
    ['luotThich là null', { luotThich: null }],
    ['luotKhongThich là null', { luotKhongThich: null }],
    ['luotThich là số âm', { luotThich: -1 }],
    ['luotKhongThich là số âm', { luotKhongThich: -1 }],
    ['luotThich là số lẻ', { luotThich: 1.5 }],
    ['luotKhongThich là số lẻ', { luotKhongThich: 0.5 }],
    ['luotThich là NaN', { luotThich: Number.NaN }],
    ['luotKhongThich vô hạn', { luotKhongThich: Infinity }],
    ['luotThich là boolean', { luotThich: true }],
  ])('ABU-12 %s ⇒ UnexpectedResponseError', (_name, extra) => {
    expect(() => parsePublicArticleDetail(detail(extra))).toThrow(
      UnexpectedResponseError,
    );
  });

  it('ABU-12 thân 7 khoá cũ của B2 (không có hai số đếm) bị từ chối', () => {
    const { luotThich, luotKhongThich, ...old } = detail();
    void luotThich;
    void luotKhongThich;
    expect(() => parsePublicArticleDetail(old)).toThrow(
      UnexpectedResponseError,
    );
  });

  it('ABU-12 khoá thừa ngoài kiểu (tác giả) vẫn bị bỏ qua, không làm vỡ', () => {
    const parsed = parsePublicArticleDetail(detail({ tacGia: { hoTen: 'x' } }));
    expect(Object.keys(parsed)).not.toContain('tacGia');
  });
});

describe('parseRatingChoice: thân của GET …/rating (ABU-09)', () => {
  it('ABU-09 `loai` là null, Thich hay KhongThich ⇒ trả đúng giá trị', () => {
    expect(parseRatingChoice({ loai: null })).toBeNull();
    expect(parseRatingChoice({ loai: 'Thich' })).toBe('Thich');
    expect(parseRatingChoice({ loai: 'KhongThich' })).toBe('KhongThich');
  });

  it.each([
    ['thân là null', null],
    ['thân là mảng', []],
    ['thân là chuỗi', 'Thich'],
    ['thân rỗng (vắng khoá loai)', {}],
    ['loai là undefined', { loai: undefined }],
    ['sai hoa thường', { loai: 'thich' }],
    ['loai lạ', { loai: 'Like' }],
    ['loai rỗng', { loai: '' }],
    ['loai là số', { loai: 1 }],
    ['loai là boolean', { loai: true }],
  ])('ABU-09 %s ⇒ UnexpectedResponseError', (_name, raw) => {
    expect(() => parseRatingChoice(raw)).toThrow(UnexpectedResponseError);
  });
});

describe('parseRatingResult: thân của PUT và DELETE …/rating (ABU-09)', () => {
  it('ABU-09 đủ ba khoá ⇒ đọc đúng; sau thu hồi `loai` là null', () => {
    expect(
      parseRatingResult({ loai: 'Thich', luotThich: 4, luotKhongThich: 2 }),
    ).toEqual({ loai: 'Thich', luotThich: 4, luotKhongThich: 2 });
    expect(
      parseRatingResult({ loai: null, luotThich: 0, luotKhongThich: 0 }),
    ).toEqual({ loai: null, luotThich: 0, luotKhongThich: 0 });
  });

  it.each([
    ['thân là null', null],
    ['thân là mảng', []],
    ['thiếu loai', { luotThich: 1, luotKhongThich: 1 }],
    ['loai lạ', { loai: 'Like', luotThich: 1, luotKhongThich: 1 }],
    ['thiếu luotThich', { loai: 'Thich', luotKhongThich: 1 }],
    ['thiếu luotKhongThich', { loai: 'Thich', luotThich: 1 }],
    [
      'luotThich là chuỗi',
      { loai: 'Thich', luotThich: '1', luotKhongThich: 1 },
    ],
    ['luotKhongThich âm', { loai: null, luotThich: 1, luotKhongThich: -1 }],
    ['luotThich lẻ', { loai: null, luotThich: 0.5, luotKhongThich: 1 }],
  ])('ABU-09 %s ⇒ UnexpectedResponseError', (_name, raw) => {
    expect(() => parseRatingResult(raw)).toThrow(UnexpectedResponseError);
  });
});
