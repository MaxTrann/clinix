import { makeDetail } from '../testing/article-fixtures';
import {
  buildCreateBody,
  buildPatch,
  changedKeys,
  charCount,
  contentBytes,
  contentLength,
  draftFromArticle,
  EMPTY_DRAFT,
  validateDraft,
  type ArticleDraft,
} from './article-form-rules';

// article F1, ABW-03 và ABW-10 (phần hàm thuần): kiểm tại chỗ, đếm ký tự, dựng thân gửi đi (PLAN 5.5, 5.7, MH15, T7).
const draft = (overrides: Partial<ArticleDraft> = {}): ArticleDraft => ({
  ...EMPTY_DRAFT,
  tieuDe: 'Tiêu đề',
  ...overrides,
});

describe('validateDraft (ABW-03, ABW-10)', () => {
  it('ABW-03 bản nháp hợp lệ ⇒ không lỗi (nội dung rỗng được khi là bản nháp)', () => {
    expect(validateDraft(draft())).toEqual({});
  });

  it.each(['', '   ', '\t\n '])(
    'ABW-03 tiêu đề %j là trống ⇒ lỗi ô tiêu đề',
    (tieuDe) => {
      expect(validateDraft(draft({ tieuDe }))).toEqual({
        tieuDe: 'Tiêu đề không được để trống và tối đa 255 ký tự.',
      });
    },
  );

  it('ABW-03 tiêu đề 255 ký tự nhận, 256 bị từ chối (tính sau khi gộp khoảng trắng)', () => {
    expect(validateDraft(draft({ tieuDe: 'a'.repeat(255) }))).toEqual({});
    expect(
      validateDraft(draft({ tieuDe: 'a'.repeat(256) })).tieuDe,
    ).toBeDefined();
    expect(validateDraft(draft({ tieuDe: `  ${'a'.repeat(255)}  ` }))).toEqual(
      {},
    );
  });

  it('ABW-10 mô tả: 500 nhận, 501 bị từ chối', () => {
    expect(validateDraft(draft({ moTaNgan: 'a'.repeat(500) }))).toEqual({});
    expect(validateDraft(draft({ moTaNgan: 'a'.repeat(501) }))).toEqual({
      moTaNgan: 'Mô tả ngắn tối đa 500 ký tự.',
    });
  });

  it('ABW-10 nội dung: 20.000 ký tự nhận, 20.001 bị từ chối', () => {
    expect(validateDraft(draft({ noiDung: 'a'.repeat(20_000) }))).toEqual({});
    expect(validateDraft(draft({ noiDung: 'a'.repeat(20_001) }))).toEqual({
      noiDung: 'Nội dung quá dài (tối đa 20.000 ký tự).',
    });
  });

  it('ABW-10 nội dung vượt 60.000 byte dù chưa tới 20.000 ký tự (16.000 emoji = 64.000 byte) cũng bị từ chối, dùng chung câu', () => {
    const emoji = '😀'.repeat(16_000);
    expect(contentLength(emoji)).toBe(16_000);
    expect(contentBytes(emoji)).toBe(64_000);
    expect(validateDraft(draft({ noiDung: emoji })).noiDung).toBe(
      'Nội dung quá dài (tối đa 20.000 ký tự).',
    );
    // 20.000 ký tự tiếng Việt (3 byte mỗi chữ ạ) = 60.000 byte: vừa đủ
    expect(validateDraft(draft({ noiDung: 'ạ'.repeat(20_000) }))).toEqual({});
  });

  it('ABW-10 đếm ký tự theo điểm mã sau khi chuẩn hoá: emoji là 1; "\\r\\n" là 1; chữ viết rời (NFD) gộp thành 1', () => {
    expect(charCount('😀')).toBe(1);
    expect(contentLength('a\r\nb')).toBe(3);
    expect(contentLength('ẻ')).toBe(1);
  });

  it('ABW-03 xuất bản mà nội dung trống ⇒ lỗi ô nội dung; bản nháp thì không', () => {
    expect(
      validateDraft(draft({ trangThai: 'DaXuatBan', noiDung: '  \n' })),
    ).toEqual({
      noiDung: 'Cần có nội dung trước khi xuất bản.',
    });
    expect(
      validateDraft(draft({ trangThai: 'DaXuatBan', noiDung: 'x' })),
    ).toEqual({});
    expect(validateDraft(draft({ trangThai: 'BanNhap', noiDung: '' }))).toEqual(
      {},
    );
  });
});

describe('buildCreateBody và buildPatch (ABW-03, ABW-07)', () => {
  it('ABW-03 thân tạo: luôn có noiDung và hashtag; mô tả trống thì bỏ khoá; tiêu đề đã gộp khoảng trắng', () => {
    expect(
      buildCreateBody(
        draft({ tieuDe: '  Bài   mới ', noiDung: '', hashtag: [] }),
      ),
    ).toEqual({
      tieuDe: 'Bài mới',
      noiDung: '',
      hashtag: [],
      trangThai: 'BanNhap',
    });
    expect(
      buildCreateBody(
        draft({
          moTaNgan: ' mô tả ',
          noiDung: 'x',
          hashtag: ['a'],
          trangThai: 'DaXuatBan',
        }),
      ),
    ).toEqual({
      tieuDe: 'Tiêu đề',
      moTaNgan: 'mô tả',
      noiDung: 'x',
      hashtag: ['a'],
      trangThai: 'DaXuatBan',
    });
  });

  it('ABW-03 thân tạo không bao giờ ở trạng thái lưu trữ', () => {
    expect(buildCreateBody(draft({ trangThai: 'LuuTruAn' })).trangThai).toBe(
      'BanNhap',
    );
  });

  const base = draftFromArticle(
    makeDetail({ moTaNgan: 'Mô tả', noiDung: 'Nội dung', hashtag: ['a', 'b'] }),
  );

  it('ABW-07 sửa: không đổi gì ⇒ thân rỗng và không có ô nào khác', () => {
    expect(changedKeys(base, { ...base })).toEqual([]);
    expect(buildPatch(base, { ...base })).toEqual({});
  });

  it('ABW-07 sửa: chỉ gửi các ô đã đổi; xoá mô tả bằng chuỗi rỗng; thẻ gửi cả mảng', () => {
    expect(buildPatch(base, { ...base, tieuDe: ' Tên  mới ' })).toEqual({
      tieuDe: 'Tên mới',
    });
    expect(buildPatch(base, { ...base, moTaNgan: '   ' })).toEqual({
      moTaNgan: '',
    });
    expect(buildPatch(base, { ...base, hashtag: ['a', 'c'] })).toEqual({
      hashtag: ['a', 'c'],
    });
    expect(buildPatch(base, { ...base, trangThai: 'LuuTruAn' })).toEqual({
      trangThai: 'LuuTruAn',
    });
  });

  it('ABW-07 đổi thứ tự thẻ, thêm khoảng trắng hai đầu hay đổi \\r\\n không tính là thay đổi', () => {
    expect(changedKeys(base, { ...base, hashtag: ['b', 'a'] })).toEqual([]);
    expect(
      changedKeys(base, {
        ...base,
        tieuDe: ` ${base.tieuDe} `,
        moTaNgan: ' Mô tả ',
      }),
    ).toEqual([]);
    const multi = { ...base, noiDung: 'a\nb' };
    expect(changedKeys(multi, { ...multi, noiDung: 'a\r\nb' })).toEqual([]);
  });

  it('ABW-09 draftFromArticle: mô tả null thành chuỗi rỗng; sao chép mảng thẻ', () => {
    const article = makeDetail({ moTaNgan: null, hashtag: ['x'] });
    const result = draftFromArticle(article);
    expect(result.moTaNgan).toBe('');
    expect(result.hashtag).toEqual(['x']);
    expect(result.hashtag).not.toBe(article.hashtag);
  });
});
