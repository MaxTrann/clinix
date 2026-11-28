import { UnexpectedResponseError } from '../../../shared/api/errors';
import { makePublicItem, makePublicPage } from '../testing/article-fixtures';
import {
  parsePublicArticleDetail,
  parsePublicArticlePage,
  parsePublicTags,
} from './parse-article';

// article F2, ABG-14: bộ kiểm hình dạng thân phản hồi công khai. Khoá giao diện CẦN (mã, tiêu đề, thẻ, nội dung, tổng, trang) thiếu hay sai kiểu ⇒ `UnexpectedResponseError`;
// khoá phụ (mô tả, ảnh, thời điểm xuất bản) chịu thiếu và coi là `null`; khoá thừa (B3 cộng `luotThich`) bị bỏ qua.
const item = () =>
  makePublicItem({ baiVietId: '12', tieuDe: 'Sốt xuất huyết' });

describe('parsePublicArticlePage', () => {
  it('ABG-14 thân đúng ⇒ trả đúng; khoá thừa của phần tử và của trang bị bỏ', () => {
    const page = makePublicPage([item()], { total: 31, page: 2, pageSize: 9 });
    const parsed = parsePublicArticlePage({
      ...page,
      thuaCuaTrang: 1,
      items: [{ ...item(), noiDung: 'không được lọt', tacGia: { hoTen: 'x' } }],
    });
    expect(parsed).toEqual(page);
    expect(Object.keys(parsed.items[0]).sort()).toEqual([
      'anhDaiDien',
      'baiVietId',
      'hashtag',
      'moTaNgan',
      'thoiDiemXuatBan',
      'tieuDe',
    ]);
  });

  it('ABG-14 khoá phụ thiếu hay `null` (dữ liệu lệch: thiếu thời điểm xuất bản) ⇒ coi là null, không lỗi', () => {
    const { moTaNgan, anhDaiDien, thoiDiemXuatBan, ...bare } = item();
    void moTaNgan;
    void anhDaiDien;
    void thoiDiemXuatBan;
    const parsed = parsePublicArticlePage({
      items: [bare, { ...item(), baiVietId: '13', thoiDiemXuatBan: null }],
      total: 2,
      page: 1,
      pageSize: 9,
    });
    expect(parsed.items.map((x) => x.thoiDiemXuatBan)).toEqual([null, null]);
    expect(parsed.items[0].moTaNgan).toBeNull();
    expect(parsed.items[0].anhDaiDien).toBeNull();
  });

  it('ABG-14 sai hình dạng ⇒ UnexpectedResponseError (ca âm)', () => {
    const base = makePublicPage([item()]);
    const bad: unknown[] = [
      null,
      'x',
      [],
      {},
      { ...base, items: 'không phải mảng' },
      { ...base, items: [null] },
      { ...base, items: [{ ...item(), baiVietId: 12 }] },
      { ...base, items: [{ ...item(), tieuDe: undefined }] },
      { ...base, items: [{ ...item(), hashtag: 'sốt' }] },
      { ...base, items: [{ ...item(), hashtag: [1] }] },
      { ...base, total: '1' },
      { ...base, total: Number.NaN },
      { ...base, page: undefined },
      { ...base, pageSize: null },
    ];
    for (const raw of bad) {
      expect(() => parsePublicArticlePage(raw)).toThrow(
        UnexpectedResponseError,
      );
    }
  });

  it('ABG-14 biên: trang rỗng hợp lệ', () => {
    expect(
      parsePublicArticlePage({ items: [], total: 0, page: 1, pageSize: 9 }),
    ).toEqual({ items: [], total: 0, page: 1, pageSize: 9 });
  });
});

describe('parsePublicArticleDetail', () => {
  it('ABG-14 chi tiết đúng ⇒ có noiDung; khoá thừa (luotThich của B3) bị bỏ', () => {
    const parsed = parsePublicArticleDetail({
      ...item(),
      noiDung: 'Nội dung bài',
      luotThich: 3,
      luotKhongThich: 1,
    });
    expect(parsed).toEqual({ ...item(), noiDung: 'Nội dung bài' });
  });

  it('ABG-14 thiếu hay sai `noiDung`, `tieuDe`, `baiVietId` ⇒ UnexpectedResponseError', () => {
    for (const raw of [
      null,
      item(),
      { ...item(), noiDung: 5 },
      { ...item(), noiDung: null },
      { ...item(), noiDung: 'x', tieuDe: null },
      { ...item(), noiDung: 'x', baiVietId: undefined },
    ]) {
      expect(() => parsePublicArticleDetail(raw)).toThrow(
        UnexpectedResponseError,
      );
    }
  });

  it('ABG-14 biên: nội dung rỗng là chuỗi hợp lệ', () => {
    expect(parsePublicArticleDetail({ ...item(), noiDung: '' }).noiDung).toBe(
      '',
    );
  });
});

describe('parsePublicTags', () => {
  it('ABG-14 thẻ đúng ⇒ danh sách { ten, soBai }; rỗng hợp lệ', () => {
    expect(
      parsePublicTags({ items: [{ ten: 'sốt', soBai: 3, thua: 1 }] }),
    ).toEqual([{ ten: 'sốt', soBai: 3 }]);
    expect(parsePublicTags({ items: [] })).toEqual([]);
  });

  it('ABG-14 sai hình dạng ⇒ UnexpectedResponseError', () => {
    for (const raw of [
      null,
      {},
      { items: 'x' },
      { items: [null] },
      { items: [{ ten: 'sốt' }] },
      { items: [{ ten: 'sốt', soBai: '3' }] },
      { items: [{ soBai: 3 }] },
    ]) {
      expect(() => parsePublicTags(raw)).toThrow(UnexpectedResponseError);
    }
  });
});
