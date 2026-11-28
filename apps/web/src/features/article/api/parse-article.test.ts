import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  countByStatus,
  makeDetail,
  makeListItem,
  makeListPage,
} from '../testing/article-fixtures';
import {
  parseArticleDetail,
  parseArticleListPage,
  parseTagSuggestions,
} from './parse-article';

// article F1, ABW-12 (phần kiểm hình dạng): thân sai hình dạng thì ném `UnexpectedResponseError` để trang hiện ErrorState, không trắng trang.
// Phần "trang hiện ErrorState" kiểm ở test trang (sau khi có giao diện). Đối chứng DƯƠNG: thân đúng hợp đồng PLAN 5.7 được nhận.
describe('parseArticleListPage (ABW-12)', () => {
  const page = () =>
    makeListPage([
      makeListItem({ baiVietId: '1', trangThai: 'BanNhap' }),
      makeListItem({ baiVietId: '2', trangThai: 'DaXuatBan' }),
    ]);

  it('ABW-12 thân đúng hợp đồng được nhận nguyên vẹn (đối chứng dương)', () => {
    const body = page();
    expect(parseArticleListPage(JSON.parse(JSON.stringify(body)))).toEqual(
      body,
    );
  });

  it('ABW-12 khoá chỉ để hiển thị phụ (mô tả, ngày, tác giả, ảnh) vắng hay null thì thành null, không hỏng', () => {
    const raw = {
      ...page(),
      items: [
        {
          baiVietId: '9',
          tieuDe: 'Chỉ có khoá cần',
          trangThai: 'LuuTruAn',
          hashtag: [],
        },
      ],
    };
    expect(parseArticleListPage(raw).items[0]).toEqual({
      baiVietId: '9',
      tieuDe: 'Chỉ có khoá cần',
      trangThai: 'LuuTruAn',
      hashtag: [],
      moTaNgan: null,
      thoiDiemXuatBan: null,
      thoiDiemTao: null,
      capNhatLanCuoi: null,
      tacGia: null,
      anhDaiDien: null,
    });
  });

  it.each([
    ['không phải đối tượng', null],
    ['là mảng', []],
    [
      'thiếu items',
      { total: 0, page: 1, pageSize: 20, demTheoTrangThai: countByStatus([]) },
    ],
    ['items không phải mảng', { ...page(), items: {} }],
    ['thiếu total', { ...page(), total: undefined }],
    ['total là chuỗi', { ...page(), total: '2' }],
    ['total là NaN', { ...page(), total: Number.NaN }],
    ['thiếu pageSize', { ...page(), pageSize: undefined }],
    ['thiếu demTheoTrangThai', { ...page(), demTheoTrangThai: undefined }],
    [
      'demTheoTrangThai thiếu một khoá',
      { ...page(), demTheoTrangThai: { BanNhap: 1, DaXuatBan: 1 } },
    ],
    [
      'demTheoTrangThai có khoá không phải số',
      {
        ...page(),
        demTheoTrangThai: { BanNhap: 1, DaXuatBan: 1, LuuTruAn: 'x' },
      },
    ],
    [
      'dòng thiếu baiVietId',
      { ...page(), items: [{ ...makeListItem(), baiVietId: undefined }] },
    ],
    [
      'baiVietId là số',
      { ...page(), items: [{ ...makeListItem(), baiVietId: 1 }] },
    ],
    [
      'dòng thiếu tieuDe',
      { ...page(), items: [{ ...makeListItem(), tieuDe: undefined }] },
    ],
    [
      'trangThai lạ',
      { ...page(), items: [{ ...makeListItem(), trangThai: 'XoaMem' }] },
    ],
    [
      'hashtag là đối tượng thay vì chuỗi',
      { ...page(), items: [{ ...makeListItem(), hashtag: [{ ten: 'a' }] }] },
    ],
    [
      'hashtag không phải mảng',
      { ...page(), items: [{ ...makeListItem(), hashtag: 'a' }] },
    ],
    ['dòng là null', { ...page(), items: [null] }],
  ])('ABW-12 %s ⇒ UnexpectedResponseError', (_label, raw) => {
    expect(() => parseArticleListPage(raw)).toThrow(UnexpectedResponseError);
  });
});

describe('parseArticleDetail (ABW-12)', () => {
  it('ABW-12 chi tiết đúng hợp đồng được nhận, có noiDung', () => {
    const detail = makeDetail({ baiVietId: '7', noiDung: 'Nội dung' });
    expect(parseArticleDetail(JSON.parse(JSON.stringify(detail)))).toEqual(
      detail,
    );
  });

  it.each([
    ['thiếu noiDung', { ...makeDetail(), noiDung: undefined }],
    ['noiDung là số', { ...makeDetail(), noiDung: 5 }],
    ['không phải đối tượng', 'x'],
    ['thiếu tieuDe', { ...makeDetail(), tieuDe: undefined }],
  ])('ABW-12 %s ⇒ UnexpectedResponseError', (_label, raw) => {
    expect(() => parseArticleDetail(raw)).toThrow(UnexpectedResponseError);
  });

  it('ABW-12 noiDung rỗng (bản nháp chưa viết) vẫn hợp lệ', () => {
    expect(parseArticleDetail({ ...makeDetail(), noiDung: '' }).noiDung).toBe(
      '',
    );
  });
});

describe('parseTagSuggestions (ABW-12)', () => {
  it('ABW-12 trả danh sách tên thẻ từ items[].ten', () => {
    expect(
      parseTagSuggestions({ items: [{ ten: 'trẻ-em' }, { ten: 'tim-mạch' }] }),
    ).toEqual(['trẻ-em', 'tim-mạch']);
    expect(parseTagSuggestions({ items: [] })).toEqual([]);
  });

  it.each([
    ['không phải đối tượng', null],
    ['thiếu items', {}],
    ['items không phải mảng', { items: 'a' }],
    ['phần tử không phải đối tượng', { items: ['a'] }],
    ['phần tử thiếu ten', { items: [{}] }],
    ['ten không phải chuỗi', { items: [{ ten: 1 }] }],
  ])('ABW-12 %s ⇒ UnexpectedResponseError', (_label, raw) => {
    expect(() => parseTagSuggestions(raw)).toThrow(UnexpectedResponseError);
  });
});
