import { ApiError } from '../../../shared/api/errors';
import { makeManyPublished, makePublished } from './article-fixtures';
import { createFakeArticleApi } from './fake-article-api';

// article F2: bản giả API công khai làm ĐÚNG hợp đồng B2 đã merge (`83bd275`), kể cả những chỗ máy chủ TỪ CHỐI, để test của trang bắt được lỗi của web.
// Chỉ kiểm bản giả (không phải mã chạy thật); hợp đồng thật đã đối chiếu từng dòng với `apps/api/src/article/public/`.
const signal = () => new AbortController().signal;
const titles = async (
  api: ReturnType<typeof createFakeArticleApi>,
  query: Parameters<typeof api.listPublic>[0],
) => (await api.listPublic(query, signal())).items.map((item) => item.tieuDe);

describe('createFakeArticleApi: danh sách công khai', () => {
  it('ABG-02 chỉ bài đã xuất bản (nháp và lưu trữ không lọt), mới nhất trước, thiếu thời điểm xuất bản xếp CUỐI, hoà thì mã giảm dần', async () => {
    const api = createFakeArticleApi([
      makePublished({
        baiVietId: '1',
        tieuDe: 'Cũ',
        thoiDiemXuatBan: '2026-11-01T00:00:00.000Z',
      }),
      makePublished({
        baiVietId: '2',
        tieuDe: 'Mới',
        thoiDiemXuatBan: '2026-11-20T00:00:00.000Z',
      }),
      makePublished({
        baiVietId: '3',
        tieuDe: 'Hoà A',
        thoiDiemXuatBan: '2026-11-10T00:00:00.000Z',
      }),
      makePublished({
        baiVietId: '4',
        tieuDe: 'Hoà B',
        thoiDiemXuatBan: '2026-11-10T00:00:00.000Z',
      }),
      makePublished({ baiVietId: '5', tieuDe: 'Lệch', thoiDiemXuatBan: null }),
      makePublished({ baiVietId: '6', tieuDe: 'Nháp', trangThai: 'BanNhap' }),
      makePublished({
        baiVietId: '7',
        tieuDe: 'Lưu trữ',
        trangThai: 'LuuTruAn',
      }),
    ]);
    expect(await titles(api, { page: 1 })).toEqual([
      'Mới',
      'Hoà B',
      'Hoà A',
      'Cũ',
      'Lệch',
    ]);
  });

  it('ABG-02 đúng 6 khoá mỗi phần tử, không noiDung, không tác giả, không trạng thái', async () => {
    const api = createFakeArticleApi([makePublished({ baiVietId: '1' })]);
    const [item] = (await api.listPublic({ page: 1 }, signal())).items;
    expect(Object.keys(item).sort()).toEqual([
      'anhDaiDien',
      'baiVietId',
      'hashtag',
      'moTaNgan',
      'thoiDiemXuatBan',
      'tieuDe',
    ]);
  });

  it('ABG-02 phân trang: mặc định 9; pageSize tuỳ chọn; trang quá cuối ⇒ items rỗng mà total đúng', async () => {
    const api = createFakeArticleApi(makeManyPublished(20));
    const first = await api.listPublic({ page: 1 }, signal());
    expect(first).toMatchObject({ total: 20, page: 1, pageSize: 9 });
    expect(first.items).toHaveLength(9);
    expect((await api.listPublic({ page: 3 }, signal())).items).toHaveLength(2);
    expect(await api.listPublic({ page: 9 }, signal())).toMatchObject({
      items: [],
      total: 20,
      page: 9,
    });
    expect(
      (await api.listPublic({ page: 1, pageSize: 4 }, signal())).items,
    ).toHaveLength(4);
  });

  it('ABG-03 `q` khớp tiêu đề không phân biệt hoa thường và dấu thanh, mũ, móc; `đ` KHÁC `d` (gõ "dau" ra "Dau bụng" mà không ra "Đau đầu")', async () => {
    const api = createFakeArticleApi([
      makePublished({ baiVietId: '1', tieuDe: 'Trẻ em bị sốt' }),
      makePublished({ baiVietId: '2', tieuDe: 'Đau đầu' }),
      makePublished({ baiVietId: '3', tieuDe: 'Dau bụng' }),
    ]);
    expect(await titles(api, { q: 'TRE EM', page: 1 })).toEqual([
      'Trẻ em bị sốt',
    ]);
    expect(await titles(api, { q: 'trẻ', page: 1 })).toEqual(['Trẻ em bị sốt']);
    expect(await titles(api, { q: 'dau', page: 1 })).toEqual(['Dau bụng']);
    expect(await titles(api, { q: 'đau', page: 1 })).toEqual(['Đau đầu']);
    expect(await titles(api, { q: 'không có', page: 1 })).toEqual([]);
  });

  it('ABG-03 `the` khớp theo collation (gõ "tre" ra thẻ "trẻ"); thẻ không có ⇒ 200 rỗng, không lỗi', async () => {
    const api = createFakeArticleApi([
      makePublished({ baiVietId: '1', tieuDe: 'A', hashtag: ['trẻ'] }),
      makePublished({ baiVietId: '2', tieuDe: 'B', hashtag: ['sốt'] }),
    ]);
    expect(await titles(api, { the: 'trẻ', page: 1 })).toEqual(['A']);
    expect(await titles(api, { the: 'tre', page: 1 })).toEqual(['A']);
    expect(await titles(api, { the: 'khong-co', page: 1 })).toEqual([]);
  });

  it('ABG-03 TỪ CHỐI như máy chủ: `the` rỗng hay sai dạng ⇒ 400 BO_LOC_KHONG_HOP_LE kèm loi[the]; q quá 100 ⇒ 400 DU_LIEU_KHONG_HOP_LE', async () => {
    const api = createFakeArticleApi([makePublished()]);
    for (const the of ['', '   ', 'a/b', '<x>']) {
      const error = await api
        .listPublic({ the, page: 1 }, signal())
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 400,
        maLoi: 'BO_LOC_KHONG_HOP_LE',
        loi: [{ truong: 'the', ma: 'THE_KHONG_HOP_LE' }],
      });
    }
    await expect(
      api.listPublic({ q: 'a'.repeat(101), page: 1 }, signal()),
    ).rejects.toMatchObject({
      status: 400,
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      loi: [{ truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' }],
    });
    // Biên: đúng 100 thì được
    await expect(
      api.listPublic({ q: 'a'.repeat(100), page: 1 }, signal()),
    ).resolves.toMatchObject({ total: 0 });
  });
});

describe('createFakeArticleApi: chi tiết và thẻ công khai', () => {
  it('ABG-05 chi tiết có noiDung; không có tác giả, trạng thái', async () => {
    const api = createFakeArticleApi([
      makePublished({ baiVietId: '12', noiDung: 'Nội dung bài' }),
    ]);
    const detail = await api.getPublic('12', signal());
    expect(detail.noiDung).toBe('Nội dung bài');
    // 7 khoá của B2 cộng `luotThich`, `luotKhongThich` của B3 (article F3); chưa ai đánh giá thì 0
    expect(Object.keys(detail)).toHaveLength(9);
    expect(detail).toMatchObject({ luotThich: 0, luotKhongThich: 0 });
  });

  it('ABG-07 id sai dạng, không có, bản nháp, lưu trữ ⇒ CÙNG MỘT 404 KHONG_TIM_THAY', async () => {
    const api = createFakeArticleApi([
      makePublished({ baiVietId: '1' }),
      makePublished({ baiVietId: '2', trangThai: 'BanNhap' }),
      makePublished({ baiVietId: '3', trangThai: 'LuuTruAn' }),
    ]);
    const errors: unknown[] = [];
    for (const id of ['abc', '0', '012', '9', '2', '3']) {
      errors.push(await api.getPublic(id, signal()).catch((e: unknown) => e));
    }
    for (const error of errors) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 404, maLoi: 'KHONG_TIM_THAY' });
    }
    expect(
      new Set(
        errors.map((e) =>
          JSON.stringify(
            e instanceof ApiError ? [e.status, e.maLoi, e.thongBao, e.loi] : e,
          ),
        ),
      ).size,
    ).toBe(1);
  });

  it('ABG-03 thẻ phổ biến: chỉ đếm bài đã xuất bản, soBai giảm rồi tên, tối đa 20', async () => {
    const api = createFakeArticleApi([
      makePublished({ baiVietId: '1', hashtag: ['b', 'a'] }),
      makePublished({ baiVietId: '2', hashtag: ['a'] }),
      makePublished({ baiVietId: '3', hashtag: ['c'], trangThai: 'BanNhap' }),
      ...Array.from({ length: 25 }, (_, index) =>
        makePublished({
          baiVietId: String(100 + index),
          hashtag: [`thẻ-${String(index).padStart(2, '0')}`],
        }),
      ),
    ]);
    const tags = await api.listPublicTags(signal());
    expect(tags).toHaveLength(20);
    expect(tags.slice(0, 2)).toEqual([
      { ten: 'a', soBai: 2 },
      { ten: 'b', soBai: 1 },
    ]);
    expect(tags.map((tag) => tag.ten)).not.toContain('c');
  });

  it('ABG-02 mỗi hàm công khai ghi vào `calls` và tôn trọng `hold`/`failNext` như hàm quản trị', async () => {
    const api = createFakeArticleApi([makePublished()]);
    const boom = new Error('boom');
    api.failNext('listPublic', boom);
    await expect(api.listPublic({ page: 1 }, signal())).rejects.toBe(boom);
    await api.listPublic({ page: 1 }, signal());
    await api.getPublic('1', signal());
    await api.listPublicTags(signal());
    expect(api.callsTo('listPublic')).toHaveLength(2);
    expect(api.callsTo('getPublic')).toHaveLength(1);
    expect(api.callsTo('listPublicTags')).toHaveLength(1);
  });
});
