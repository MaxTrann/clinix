import type { AppException } from '../../common/errors/app.exception.js';
import { PublicArticleListQueryDto } from './public-article.dto.js';
import type {
  PublicArticleRepository,
  PublicArticleRow,
} from './public-article.repository.js';
import { PublicArticleService } from './public-article.service.js';

// article B2: service công khai với repository GIẢ (không DB): 404 cùng thân cho mọi lý do (ABQ-03), 400 BO_LOC_KHONG_HOP_LE cho `the` sai dạng (ABT-09), danh sách trắng khoá
// (ABP-01, ABP-06: không bao giờ lọt tác giả, email, trạng thái, nội dung ở danh sách), `thoiDiemXuatBan` null (ABP-12). Truy vấn thật nằm ở `article-public.int-spec.ts`.
const AT = new Date('2026-11-05T02:30:00.000Z');

/** Dòng "bẩn": repository đọc thừa cột (tác giả, email, trạng thái, nội dung) để chứng minh service tự chọn lại từng khoá. */
const dirty = (over: Partial<PublicArticleRow> = {}): PublicArticleRow =>
  ({
    baiVietId: '7',
    tieuDe: 'Sốt xuất huyết',
    moTaNgan: null,
    anhDaiDien: null,
    thoiDiemXuatBan: AT,
    tacGiaId: '3',
    tacGiaHoTen: 'Nguyễn Tác Giả',
    email: 'tac.gia@example.test',
    trangThai: 'DaXuatBan',
    noiDung: 'không được lộ ở danh sách',
    ...over,
  }) as PublicArticleRow;

/** Service với repository giả: mặc định trả rỗng; ca nào cần dữ liệu thì đặt `mockResolvedValue` trên mock tương ứng. */
function setup() {
  const repository = {
    list: vi.fn<PublicArticleRepository['list']>(async () => ({
      rows: [],
      total: 0,
      tags: new Map<string, string[]>(),
    })),
    detail: vi.fn<PublicArticleRepository['detail']>(async () => null),
    popularTags: vi.fn<PublicArticleRepository['popularTags']>(async () => []),
  };
  const service = new PublicArticleService(
    repository as unknown as PublicArticleRepository,
  );
  return { service, repository };
}

const query = (over: Partial<PublicArticleListQueryDto> = {}) =>
  Object.assign(new PublicArticleListQueryDto(), over);

async function rejection(work: Promise<unknown>): Promise<AppException> {
  const error: unknown = await work.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error, 'phải bị từ chối').toBeDefined();
  return error as AppException;
}

describe('article B2 — service công khai: chi tiết', () => {
  it('ABQ-03: id sai dạng ⇒ 404 KHONG_TIM_THAY mà KHÔNG chạm repository; id không có (hay không còn xuất bản) ⇒ CÙNG thân, CÙNG trạng thái', async () => {
    const { service, repository } = setup();
    const bodies: unknown[] = [];
    for (const id of [
      'abc',
      '0',
      '-1',
      '12345678901234567890',
      '9223372036854775808',
      '5-sot',
      '',
    ]) {
      const error = await rejection(service.detail(id));
      expect(error.getStatus(), id).toBe(404);
      bodies.push(error.getResponse());
    }
    expect(repository.detail).not.toHaveBeenCalled();
    // id đúng dạng nhưng repository không tìm thấy (không có / BanNhap / LuuTruAn)
    const missing = await rejection(service.detail('99'));
    expect(repository.detail).toHaveBeenCalledWith('99');
    expect(missing.getStatus()).toBe(404);
    bodies.push(missing.getResponse());
    for (const body of bodies) expect(body).toEqual(bodies[0]);
    expect(bodies[0]).toMatchObject({ maLoi: 'KHONG_TIM_THAY' });
  });

  it('ABP-06: chi tiết có đúng 7 khoá (không tacGia, tacGiaId, email, trangThai) dù repository đọc thừa; thời điểm thành ISO UTC', async () => {
    const { service, repository } = setup();
    repository.detail.mockResolvedValue({
      row: { ...dirty(), noiDung: 'Nội dung <b>nguyên văn</b>' },
      tags: ['sot', 'ho'],
    });
    const result = await service.detail('7');
    expect(Object.keys(result).sort()).toEqual(
      [
        'anhDaiDien',
        'baiVietId',
        'hashtag',
        'moTaNgan',
        'noiDung',
        'thoiDiemXuatBan',
        'tieuDe',
      ].sort(),
    );
    expect(result).toEqual({
      baiVietId: '7',
      tieuDe: 'Sốt xuất huyết',
      moTaNgan: null,
      anhDaiDien: null,
      thoiDiemXuatBan: '2026-11-05T02:30:00.000Z',
      hashtag: ['sot', 'ho'],
      noiDung: 'Nội dung <b>nguyên văn</b>',
    });
    expect(JSON.stringify(result)).not.toMatch(/tac\.gia|Tác Giả|DaXuatBan/);
  });

  it('ABP-12: thoiDiemXuatBan null (dữ liệu lệch) ⇒ chi tiết vẫn trả, thoiDiemXuatBan là null, không ném lỗi', async () => {
    const { service, repository } = setup();
    repository.detail.mockResolvedValue({
      row: { ...dirty({ thoiDiemXuatBan: null }), noiDung: 'x' },
      tags: [],
    });
    expect((await service.detail('7')).thoiDiemXuatBan).toBeNull();
  });
});

describe('article B2 — service công khai: danh sách', () => {
  it.each([
    ['ký tự <', 'a<b'],
    ['dấu /', 'a/b'],
    ['dấu gạch dưới', 'a_b'],
    ['emoji', '😀'],
    ['chỉ dấu gạch', '-'],
    ['rỗng', ''],
    ['chỉ khoảng trắng', '   '],
    ['chỉ dấu thăng', '#'],
    ['51 ký tự', 'a'.repeat(51)],
  ])(
    'ABT-09: the %s ⇒ 400 BO_LOC_KHONG_HOP_LE (loi the/THE_KHONG_HOP_LE), repository không bị gọi',
    async (_name, the) => {
      const { service, repository } = setup();
      const error = await rejection(service.list(query({ the })));
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        maLoi: 'BO_LOC_KHONG_HOP_LE',
        loi: [{ truong: 'the', ma: 'THE_KHONG_HOP_LE' }],
      });
      expect(repository.list).not.toHaveBeenCalled();
    },
  );

  it('ABT-09: the được chuẩn hoá như khi lưu (HO, " #Ho ", NFD) trước khi tra; 50 ký tự nhận', async () => {
    const { service, repository } = setup();
    for (const the of ['HO', ' #Ho ', 'ho']) await service.list(query({ the }));
    await service.list(query({ the: 'Sốt'.normalize('NFD') }));
    await service.list(query({ the: 'a'.repeat(50) }));
    expect(repository.list.mock.calls.map(([filter]) => filter.the)).toEqual([
      'ho',
      'ho',
      'ho',
      'sốt',
      'a'.repeat(50),
    ]);
  });

  it('ABP-03: q rỗng thành "không lọc" (undefined); q có chữ được chuyển nguyên; limit và offset theo trang', async () => {
    const { service, repository } = setup();
    await service.list(query({ q: '', page: 3, pageSize: 9 }));
    await service.list(query({ q: 'trẻ em' }));
    expect(repository.list.mock.calls[0]?.[0]).toEqual({
      q: undefined,
      the: undefined,
      limit: 9,
      offset: 18,
    });
    expect(repository.list.mock.calls[1]?.[0]?.q).toBe('trẻ em');
  });

  it('ABP-02: page rất lớn làm offset vượt số nguyên an toàn ⇒ 400 DU_LIEU_KHONG_HOP_LE (TRANG_KHONG_HOP_LE), không gọi repository', async () => {
    const { service, repository } = setup();
    const error = await rejection(service.list(query({ page: 1e20 })));
    expect(error.getResponse()).toMatchObject({
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      loi: [{ truong: 'page', ma: 'TRANG_KHONG_HOP_LE' }],
    });
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('ABP-01 và ABP-12: mỗi bài đúng 6 khoá (không noiDung, tacGia, email, trangThai) dù repository đọc thừa; thẻ theo bài, bài không thẻ có []; thoiDiemXuatBan null giữ null', async () => {
    const { service, repository } = setup();
    repository.list.mockResolvedValue({
      rows: [
        dirty({ baiVietId: '9' }),
        dirty({ baiVietId: '8', thoiDiemXuatBan: null }),
      ],
      total: 2,
      tags: new Map([['9', ['ho', 'sot']]]),
    });
    const result = await service.list(query());
    expect(result).toMatchObject({ total: 2, page: 1, pageSize: 9 });
    for (const item of result.items)
      expect(Object.keys(item).sort()).toEqual(
        [
          'anhDaiDien',
          'baiVietId',
          'hashtag',
          'moTaNgan',
          'thoiDiemXuatBan',
          'tieuDe',
        ].sort(),
      );
    expect(result.items[0]).toMatchObject({
      baiVietId: '9',
      thoiDiemXuatBan: '2026-11-05T02:30:00.000Z',
      hashtag: ['ho', 'sot'],
    });
    expect(result.items[1]).toMatchObject({
      baiVietId: '8',
      thoiDiemXuatBan: null,
      hashtag: [],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /tac\.gia|Tác Giả|DaXuatBan|không được lộ/,
    );
  });
});

describe('article B2 — service công khai: thẻ phổ biến', () => {
  it('ABP-08: lấy tối đa 20 thẻ và chỉ trả ten, soBai', async () => {
    const { service, repository } = setup();
    // repository đọc thừa một khoá lạ: service chỉ trả ten và soBai
    repository.popularTags.mockResolvedValue([
      { ten: 'ho', soBai: 3, rac: 'x' } as unknown as {
        ten: string;
        soBai: number;
      },
    ]);
    expect(await service.popularTags()).toEqual({
      items: [{ ten: 'ho', soBai: 3 }],
    });
    expect(repository.popularTags).toHaveBeenCalledWith(20);
  });
});
