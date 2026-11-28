import { ApiError, RequestAbortedError } from '../../../shared/api/errors';
import { ARTICLE_ERROR, collectErrorCodes } from '../common/article-errors';
import { makeDetail } from './article-fixtures';
import { createFakeArticleApi } from './fake-article-api';

// Bản giả phải làm đúng hợp đồng PLAN 5.7, 5.8 thì test trang dựa vào nó mới có giá trị. Mã test: nhóm ABW của PLAN mục 7.7 (dữ liệu giả cho ABW-02, 03, 05, 06).
const signal = () => new AbortController().signal;

const seed = () => [
  makeDetail({
    baiVietId: '1',
    tieuDe: 'Sốt xuất huyết',
    trangThai: 'DaXuatBan',
    hashtag: ['sốt', 'trẻ-em'],
    capNhatLanCuoi: '2026-11-20T03:00:00.000Z',
  }),
  makeDetail({
    baiVietId: '2',
    tieuDe: 'Tiểu đường',
    trangThai: 'BanNhap',
    hashtag: ['trẻ-em'],
    capNhatLanCuoi: '2026-11-22T03:00:00.000Z',
  }),
  makeDetail({
    baiVietId: '3',
    tieuDe: 'Tim mạch',
    trangThai: 'LuuTruAn',
    hashtag: [],
    capNhatLanCuoi: '2026-11-21T03:00:00.000Z',
  }),
];

async function codesOf(promise: Promise<unknown>): Promise<string[]> {
  return promise.then(
    () => [],
    (error: unknown) => collectErrorCodes(error),
  );
}

describe('createFakeArticleApi.list', () => {
  it('ABW-02 sắp theo cập nhật gần nhất, không có noiDung, đếm đủ ba trạng thái', async () => {
    const api = createFakeArticleApi(seed());
    const page = await api.list({ page: 1 }, signal());

    expect(page.items.map((item) => item.baiVietId)).toEqual(['2', '3', '1']);
    expect(page.items.every((item) => !('noiDung' in item))).toBe(true);
    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 20 });
    expect(page.demTheoTrangThai).toEqual({
      BanNhap: 1,
      DaXuatBan: 1,
      LuuTruAn: 1,
    });
  });

  it('ABW-02 lọc theo q (không phân biệt hoa thường), the, trangThai; số đếm tính trên mọi bộ lọc TRỪ trangThai', async () => {
    const api = createFakeArticleApi(seed());

    expect(
      (await api.list({ page: 1, q: 'SỐT' }, signal())).items,
    ).toHaveLength(1);

    const byTag = await api.list(
      { page: 1, the: 'trẻ-em', trangThai: 'BanNhap' },
      signal(),
    );
    expect(byTag.items.map((item) => item.baiVietId)).toEqual(['2']);
    expect(byTag.total).toBe(1);
    // chip vẫn đếm cả bài đã xuất bản có thẻ này
    expect(byTag.demTheoTrangThai).toEqual({
      BanNhap: 1,
      DaXuatBan: 1,
      LuuTruAn: 0,
    });
  });

  it('ABW-02 phân trang 20 dòng; trang quá cuối: items rỗng mà total vẫn đúng', async () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      makeDetail({ baiVietId: String(index + 1), tieuDe: `Bài ${index + 1}` }),
    );
    const api = createFakeArticleApi(many);

    expect((await api.list({ page: 2 }, signal())).items).toHaveLength(5);
    const beyond = await api.list({ page: 9 }, signal());
    expect(beyond.items).toEqual([]);
    expect(beyond.total).toBe(25);
  });
});

describe('createFakeArticleApi.create', () => {
  it('ABW-03 tạo bản nháp: nội dung rỗng được, mô tả rỗng thành null, tác giả và thời điểm do máy chủ đặt', async () => {
    const api = createFakeArticleApi();
    const created = await api.create({
      tieuDe: '  Bài   mới ',
      noiDung: '',
      hashtag: ['  #Trẻ Em ', 'trẻ-em'],
      trangThai: 'BanNhap',
    });

    expect(created).toMatchObject({
      baiVietId: '1',
      tieuDe: 'Bài mới',
      moTaNgan: null,
      trangThai: 'BanNhap',
      thoiDiemXuatBan: null,
      hashtag: ['trẻ-em'],
      anhDaiDien: null,
    });
    expect(created.tacGia).not.toBeNull();
  });

  it('ABW-05 lỗi theo ô: tiêu đề trống, mô tả quá dài, nội dung quá dài hay có ký tự cấm, thẻ sai và quá nhiều', async () => {
    const api = createFakeArticleApi();
    const base = {
      tieuDe: 'a',
      noiDung: '',
      hashtag: [],
      trangThai: 'BanNhap' as const,
    };

    expect(await codesOf(api.create({ ...base, tieuDe: '   ' }))).toEqual([
      ARTICLE_ERROR.invalidData,
      ARTICLE_ERROR.title,
    ]);
    expect(
      await codesOf(api.create({ ...base, tieuDe: 'x'.repeat(256) })),
    ).toContain(ARTICLE_ERROR.title);
    expect(
      await codesOf(api.create({ ...base, moTaNgan: 'x'.repeat(501) })),
    ).toContain(ARTICLE_ERROR.summaryTooLong);
    // mô tả có ký tự điều khiển (mã B1 thêm): MO_TA_KHONG_HOP_LE ở loi[], truong moTaNgan
    expect(
      await codesOf(api.create({ ...base, moTaNgan: 'a\u0000b' })),
    ).toContain(ARTICLE_ERROR.summaryInvalid);
    expect(
      await codesOf(api.create({ ...base, noiDung: 'x'.repeat(20_001) })),
    ).toContain(ARTICLE_ERROR.contentTooLong);
    // 16.000 emoji = 16.000 ký tự nhưng 64.000 byte: vượt giới hạn byte
    expect(
      await codesOf(api.create({ ...base, noiDung: '😀'.repeat(16_000) })),
    ).toContain(ARTICLE_ERROR.contentTooLong);
    expect(
      await codesOf(api.create({ ...base, noiDung: 'a\u0000b' })),
    ).toContain(ARTICLE_ERROR.contentInvalid);
    expect(await codesOf(api.create({ ...base, hashtag: ['a b!'] }))).toContain(
      ARTICLE_ERROR.tagInvalid,
    );
    expect(
      await codesOf(
        api.create({
          ...base,
          hashtag: Array.from({ length: 11 }, (_, i) => `t${i}`),
        }),
      ),
    ).toContain(ARTICLE_ERROR.tooManyTags);
    expect(api.articles()).toEqual([]);
  });

  it('ABW-05 nghiệp vụ ở maLoi: xuất bản không có nội dung, tạo thẳng ở trạng thái lưu trữ', async () => {
    const api = createFakeArticleApi();

    expect(
      await codesOf(
        api.create({
          tieuDe: 'a',
          noiDung: '  ',
          hashtag: [],
          trangThai: 'DaXuatBan',
        }),
      ),
    ).toEqual([ARTICLE_ERROR.contentRequiredToPublish]);
    expect(
      await codesOf(
        api.create({
          tieuDe: 'a',
          noiDung: 'x',
          hashtag: [],
          trangThai: 'LuuTruAn' as 'BanNhap',
        }),
      ),
    ).toEqual([ARTICLE_ERROR.statusInvalid]);
  });
});

describe('createFakeArticleApi.update', () => {
  it('ABW-06 đổi trạng thái: thoiDiemXuatBan đặt MỘT lần ở lần đầu xuất bản, giữ nguyên khi lưu trữ rồi xuất bản lại', async () => {
    const api = createFakeArticleApi([
      makeDetail({ baiVietId: '1', noiDung: 'x' }),
    ]);

    const published = await api.update('1', { trangThai: 'DaXuatBan' });
    expect(published.thoiDiemXuatBan).not.toBeNull();
    await api.update('1', { trangThai: 'LuuTruAn' });
    const again = await api.update('1', { trangThai: 'DaXuatBan' });
    expect(again.thoiDiemXuatBan).toBe(published.thoiDiemXuatBan);
  });

  it('ABW-06 xuất bản bài không có nội dung ⇒ 400 NOI_DUNG_BAT_BUOC_KHI_XUAT_BAN và bài giữ nguyên', async () => {
    const api = createFakeArticleApi([
      makeDetail({ baiVietId: '1', noiDung: '' }),
    ]);

    expect(await codesOf(api.update('1', { trangThai: 'DaXuatBan' }))).toEqual([
      ARTICLE_ERROR.contentRequiredToPublish,
    ]);
    expect(api.articles()[0].trangThai).toBe('BanNhap');
  });

  it('ABW-03 chỉ đổi các khoá có mặt; hashtag có mặt thì thay toàn bộ; moTaNgan rỗng thì xoá', async () => {
    const api = createFakeArticleApi([
      makeDetail({ baiVietId: '1', hashtag: ['a', 'b'] }),
    ]);

    const renamed = await api.update('1', { tieuDe: 'Tên mới' });
    expect(renamed).toMatchObject({
      tieuDe: 'Tên mới',
      hashtag: ['a', 'b'],
      noiDung: 'Diệt muỗi và lăng quăng.',
    });
    expect((await api.update('1', { hashtag: ['c'] })).hashtag).toEqual(['c']);
    expect((await api.update('1', { moTaNgan: '' })).moTaNgan).toBeNull();
  });

  it('ABW-05 bài không có ⇒ 404 KHONG_TIM_THAY', async () => {
    const api = createFakeArticleApi();

    expect(await codesOf(api.update('99', { tieuDe: 'a' }))).toEqual([
      ARTICLE_ERROR.notFound,
    ]);
    expect(await codesOf(api.get('99', signal()))).toEqual([
      ARTICLE_ERROR.notFound,
    ]);
  });
});

describe('createFakeArticleApi.suggestTags và công cụ điều khiển', () => {
  it('ABW-04 gợi ý thẻ đã có theo tiền tố, tối đa 10, sắp theo tên', async () => {
    const api = createFakeArticleApi(seed());

    expect(await api.suggestTags('t', signal())).toEqual(['trẻ-em']);
    expect(await api.suggestTags('zzz', signal())).toEqual([]);
    const many = createFakeArticleApi([
      makeDetail({
        hashtag: Array.from(
          { length: 12 },
          (_, i) => `t${String(i).padStart(2, '0')}`,
        ),
      }),
    ]);
    expect(await many.suggestTags('t', signal())).toHaveLength(10);
  });

  it('ABW-04 gợi ý khớp tiền tố KHÔNG phân biệt dấu và hoa thường (như collation của máy chủ): "tre" ra "trẻ-em"', async () => {
    const api = createFakeArticleApi(seed());

    expect(await api.suggestTags('tre', signal())).toEqual(['trẻ-em']);
    expect(await api.suggestTags('TRE', signal())).toEqual(['trẻ-em']);
    expect(await api.suggestTags('trẻ-e', signal())).toEqual(['trẻ-em']);
  });

  it('ABW-04 `đ` và `d` là hai thẻ khác nhau (B1 đã đo thật): gõ "dau" không ra "đau", gõ "đau" mới ra; dấu móc và mũ vẫn khớp ("duong" ra "dương")', async () => {
    const api = createFakeArticleApi([
      makeDetail({ hashtag: ['đau-đầu', 'dau-bung', 'dương'] }),
    ]);

    expect(await api.suggestTags('dau', signal())).toEqual(['dau-bung']);
    expect(await api.suggestTags('đau', signal())).toEqual(['đau-đầu']);
    expect(await api.suggestTags('duong', signal())).toEqual(['dương']);
  });

  it('ABW-05 failNext làm đúng MỘT lời gọi kế tiếp hỏng với lỗi đã đặt', async () => {
    const api = createFakeArticleApi(seed());
    const error = new ApiError(403, {
      maLoi: ARTICLE_ERROR.forbidden,
      thongBao: 'x',
    });
    api.failNext('list', error);

    await expect(api.list({ page: 1 }, signal())).rejects.toBe(error);
    await expect(api.list({ page: 1 }, signal())).resolves.toMatchObject({
      total: 3,
    });
    expect(api.callsTo('list')).toHaveLength(2);
  });

  it('ABW-02 hold giữ lời gọi lơ lửng cho tới khi release (dựng ca kết quả cũ về sau kết quả mới)', async () => {
    const api = createFakeArticleApi(seed());
    const gate = api.hold('list');
    let settled = false;
    const first = api.list({ page: 1 }, signal()).then((page) => {
      settled = true;
      return page;
    });

    const second = await api.list({ page: 1, q: 'tim' }, signal());
    expect(second.total).toBe(1);
    expect(settled).toBe(false);
    gate.release();
    expect((await first).total).toBe(3);
  });

  it('ABW-02 lời gọi bị huỷ trong lúc chờ ⇒ RequestAbortedError (như lớp client thật)', async () => {
    const api = createFakeArticleApi(seed());
    const gate = api.hold('get');
    const controller = new AbortController();
    const pending = api.get('1', controller.signal);

    controller.abort();
    gate.release();
    await expect(pending).rejects.toBeInstanceOf(RequestAbortedError);
  });
});
