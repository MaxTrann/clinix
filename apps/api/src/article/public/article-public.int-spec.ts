import type { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  ArticleFixtures,
  captureSql,
  rejection,
} from '../testing/article-fixtures.js';
import { PublicArticleListQueryDto } from './public-article.dto.js';
import { PublicArticleRepository } from './public-article.repository.js';
import { PublicArticleService } from './public-article.service.js';

// article B2 — tích hợp trên MySQL 8.4 THẬT cho API công khai bài viết (PLAN article 7.2, 7.4, 7.6): ABQ-03 và ABQ-04 (chỉ bài đã xuất bản, mức service), ABT-10 (thẻ tắt),
// ABP-01 (thứ tự, ISO UTC, hai múi giờ), ABP-02 (phân trang), ABP-03 (`LIKE` thoát `%`, `_`, `!`; không phân biệt hoa thường và dấu), ABP-04 (giao `q` và `the`), ABP-08 (thẻ phổ biến),
// ABP-09 (chỉ đọc: ảnh chụp và READ ONLY), ABP-10 (không đọc `noi_dung`, không N+1), ABP-12 (`thoi_diem_xuat_ban` NULL). Chạy ở CẢ TZ=UTC và TZ=Asia/Ho_Chi_Minh.
// Thời điểm xuất bản chèn bằng instant biết trước (không phụ thuộc đồng hồ giả); `useIntegrationHooks` giả `Date` nên mọi chờ có hạn chót phải dùng `performance.now()`.
let db: DataSource;
let fx: AdminFixtures;
let af: ArticleFixtures;
let service: PublicArticleService;
let adminId: string;
useIntegrationHooks((d) => {
  db = d;
  fx = new AdminFixtures(d);
  af = new ArticleFixtures(d);
  service = new PublicArticleService(new PublicArticleRepository(d));
});
beforeEach(async () => {
  adminId = (await fx.admin()).account.taiKhoanId;
});

const T1 = new Date('2026-11-05T02:30:00.000Z');
const MINUTE = 60_000;
const at = (minutes: number): Date => new Date(T1.getTime() + minutes * MINUTE);

const list = (over: Partial<PublicArticleListQueryDto> = {}) =>
  service.list(Object.assign(new PublicArticleListQueryDto(), over));
const titles = async (over: Partial<PublicArticleListQueryDto> = {}) =>
  (await list(over)).items.map((item) => item.tieuDe);
const publish = (
  tieuDe: string,
  extra: Partial<Parameters<ArticleFixtures['published']>[0]> = {},
) => af.published({ tacGiaId: adminId, tieuDe, thoiDiemXuatBan: T1, ...extra });

/** Thử ghi bằng chính `manager` của lời gọi công khai: trả errno MySQL nếu bị từ chối, `undefined` nếu ghi được. */
async function writeProbe(manager: EntityManager): Promise<number | undefined> {
  try {
    await manager.query("INSERT INTO hashtag (ten) VALUES ('khong-duoc-ghi')");
    return undefined;
  } catch (error) {
    return (error as QueryFailedError & { driverError: { errno: number } })
      .driverError.errno;
  }
}

describe('chỉ bài đã xuất bản (ABQ-03, ABQ-04)', () => {
  it('ABQ-03: chi tiết của bài BanNhap, LuuTruAn, id không có và id sai dạng ⇒ CÙNG một 404 KHONG_TIM_THAY; bài DaXuatBan thì có', async () => {
    const draft = await af.published({
      tacGiaId: adminId,
      tieuDe: 'Nháp',
      trangThai: 'BanNhap',
      thoiDiemXuatBan: null,
    });
    const archived = await af.published({
      tacGiaId: adminId,
      tieuDe: 'Lưu trữ',
      trangThai: 'LuuTruAn',
    });
    const live = await publish('Đang xuất bản');
    const bodies: unknown[] = [];
    for (const id of [
      draft,
      archived,
      '987654321',
      'abc',
      '0',
      '-1',
      '12345678901234567890',
    ]) {
      const error = await rejection(service.detail(id));
      expect(error.getStatus(), id).toBe(404);
      bodies.push(error.getResponse());
    }
    for (const body of bodies) expect(body).toEqual(bodies[0]);
    expect(bodies[0]).toMatchObject({ maLoi: 'KHONG_TIM_THAY' });
    expect((await service.detail(live)).tieuDe).toBe('Đang xuất bản');
  });

  it('ABQ-03: ẩn bài (LuuTruAn) hay đưa về nháp rồi gọi chi tiết ⇒ 404 ngay; xuất bản lại ⇒ lại thấy', async () => {
    const id = await publish('Bài đổi trạng thái');
    expect((await service.detail(id)).baiVietId).toBe(id);
    for (const status of ['LuuTruAn', 'BanNhap']) {
      await db.query(
        'UPDATE bai_viet SET trang_thai = ? WHERE bai_viet_id = ?',
        [status, id],
      );
      expect((await rejection(service.detail(id))).getStatus(), status).toBe(
        404,
      );
    }
    await db.query(
      "UPDATE bai_viet SET trang_thai = 'DaXuatBan' WHERE bai_viet_id = ?",
      [id],
    );
    expect((await service.detail(id)).baiVietId).toBe(id);
  });

  it('ABQ-04: danh sách có ba trạng thái, q và the đều khớp cả bản nháp và bản lưu trữ ⇒ chỉ DaXuatBan; total đếm đúng bài đó', async () => {
    await publish('Sốt xuất huyết', { hashtags: ['sot'] });
    await af.published({
      tacGiaId: adminId,
      tieuDe: 'Sốt nháp',
      trangThai: 'BanNhap',
      hashtags: ['sot'],
      thoiDiemXuatBan: null,
    });
    await af.published({
      tacGiaId: adminId,
      tieuDe: 'Sốt lưu trữ',
      trangThai: 'LuuTruAn',
      hashtags: ['sot'],
    });
    for (const filter of [
      {},
      { q: 'sốt' },
      { the: 'sot' },
      { q: 'sốt', the: 'sot' },
    ]) {
      const page = await list(filter);
      expect(
        page.items.map((i) => i.tieuDe),
        JSON.stringify(filter),
      ).toEqual(['Sốt xuất huyết']);
      expect(page.total, JSON.stringify(filter)).toBe(1);
    }
  });
});

describe('thẻ tắt không hiện (ABT-10)', () => {
  it('ABT-10: thẻ trang_thai_hoat_dong = false không có ở hashtag[] của danh sách và chi tiết, không ở thẻ phổ biến; lọc theo thẻ tắt ⇒ rỗng (như thẻ không có)', async () => {
    await af.hashtag('tat', false);
    const id = await publish('Bài có thẻ tắt', {
      hashtags: ['tat', 'ho', 'an'],
    });
    expect((await list()).items[0]?.hashtag).toEqual(['an', 'ho']);
    expect((await service.detail(id)).hashtag).toEqual(['an', 'ho']);
    expect((await service.popularTags()).items.map((t) => t.ten)).toEqual([
      'an',
      'ho',
    ]);
    const filtered = await list({ the: 'tat' });
    expect(filtered.items).toEqual([]);
    expect(filtered.total).toBe(0);
    expect((await list({ the: 'ho' })).total).toBe(1);
  });
});

describe('thứ tự, ISO UTC và hai múi giờ (ABP-01)', () => {
  it('ABP-01: mới nhất trước, hoà thì id giảm; đúng 6 khoá; thoiDiemXuatBan là instant đã chèn (ISO UTC) ở cả hai múi giờ', async () => {
    const oldest = await publish('Cũ nhất', { thoiDiemXuatBan: at(-60) });
    const tieA = await publish('Hoà A', { thoiDiemXuatBan: at(0) });
    const tieB = await publish('Hoà B', { thoiDiemXuatBan: at(0) });
    const newest = await publish('Mới nhất', { thoiDiemXuatBan: at(60) });
    const page = await list();
    expect(page.items.map((i) => i.baiVietId)).toEqual([
      newest,
      tieB,
      tieA,
      oldest,
    ]);
    for (const item of page.items)
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
    expect(page.items[0]?.thoiDiemXuatBan).toBe(at(60).toISOString());
    expect(page.items[3]?.thoiDiemXuatBan).toBe(at(-60).toISOString());
    // cột lưu giờ Việt Nam (+07:00): 02:30 UTC là 09:30, bất kể TZ của tiến trình Node
    expect((await af.articleRow(tieA))?.thoiDiemXuatBan).toBe(
      '2026-11-05 09:30:00',
    );
  });

  it('ABP-01: hashtag[] sắp theo tên; bài không thẻ có []; anhDaiDien luôn có (null ở B2)', async () => {
    await publish('Nhiều thẻ', { hashtags: ['sot', 'an', 'ho'] });
    await publish('Không thẻ', { thoiDiemXuatBan: at(-1) });
    const [first, second] = (await list()).items;
    expect(first?.hashtag).toEqual(['an', 'ho', 'sot']);
    expect(second?.hashtag).toEqual([]);
    expect(first).toHaveProperty('anhDaiDien', null);
  });
});

describe('phân trang (ABP-02)', () => {
  it('ABP-02: 12 bài, pageSize mặc định 9: trang 1 có 9, trang 2 có 3, trang 3 rỗng; total luôn 12; không bài nào lặp giữa các trang', async () => {
    const ids = await af.publishedMany(adminId, 12);
    const page1 = await list({ page: 1 });
    const page2 = await list({ page: 2 });
    const page3 = await list({ page: 3 });
    expect(page1.items).toHaveLength(9);
    expect(page2.items).toHaveLength(3);
    expect(page3.items).toEqual([]);
    for (const page of [page1, page2, page3]) expect(page.total).toBe(12);
    expect([page1, page2, page3].map((p) => [p.page, p.pageSize])).toEqual([
      [1, 9],
      [2, 9],
      [3, 9],
    ]);
    const seen = [...page1.items, ...page2.items].map((i) => i.baiVietId);
    expect(new Set(seen).size).toBe(12);
    expect(seen).toEqual([...ids].reverse());
  });
});

describe('tìm tiêu đề (ABP-03, ABP-04)', () => {
  beforeEach(async () => {
    for (const title of [
      'Trẻ em bị sốt',
      'Giảm 50% đường',
      'a_b',
      'aXb',
      'Ôi! Sốt',
      'Đau đầu',
      'Dau bụng',
    ])
      await publish(title);
  });

  it('ABP-03: không phân biệt hoa thường và dấu: tre em, TRẺ EM, trẻ em đều ra "Trẻ em bị sốt"; q là đoạn giữa tiêu đề', async () => {
    for (const q of ['tre em', 'TRẺ EM', 'trẻ em', 'em bị sốt'])
      expect(await titles({ q }), q).toEqual(['Trẻ em bị sốt']);
  });

  it.each([
    ['%', ['Giảm 50% đường']],
    ['50%', ['Giảm 50% đường']],
    ['_', ['a_b']],
    ['a_b', ['a_b']],
    ['!', ['Ôi! Sốt']],
    ['i!', ['Ôi! Sốt']],
  ])(
    'ABP-03: q=%s khớp NGUYÊN VĂN ký tự đó (thoát %, _, !), không phải ký tự đại diện',
    async (q, expected) => {
      expect(await titles({ q })).toEqual(expected);
    },
  );

  it('ABP-03 (ghi lại hành vi đo thật, L-3): `đ` KHÁC `d` ở collation utf8mb4_unicode_ci: q=dau không ra "Đau đầu" mà ra "Dau bụng"; q=đau ra "Đau đầu"', async () => {
    expect(await titles({ q: 'dau' })).toEqual(['Dau bụng']);
    expect(await titles({ q: 'đau' })).toEqual(['Đau đầu']);
  });

  it('ABP-03: q không khớp ⇒ items rỗng, total 0 (ABP-05)', async () => {
    const page = await list({ q: 'không-có-bài-nào' });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  it('ABP-04: q cùng the là GIAO: chỉ bài khớp cả hai', async () => {
    await publish('Sốt xuất huyết', {
      hashtags: ['sot'],
      thoiDiemXuatBan: at(1),
    });
    await publish('Sốt cao ở trẻ', {
      hashtags: ['tre-em'],
      thoiDiemXuatBan: at(2),
    });
    await publish('Ho gà', { hashtags: ['sot'], thoiDiemXuatBan: at(3) });
    expect(await titles({ q: 'sốt', the: 'sot' })).toEqual(['Sốt xuất huyết']);
    expect(await titles({ the: 'sot' })).toEqual(['Ho gà', 'Sốt xuất huyết']);
    expect(await titles({ q: 'sốt', the: 'tre-em' })).toEqual([
      'Sốt cao ở trẻ',
    ]);
    expect(await titles({ q: 'ho gà', the: 'tre-em' })).toEqual([]);
  });
});

describe('thẻ phổ biến (ABP-08)', () => {
  it('ABP-08: chỉ đếm bài đã xuất bản; thẻ chỉ có ở bài nháp hay bài lưu trữ không hiện; soBai giảm dần rồi tên', async () => {
    await publish('Một', { hashtags: ['sot', 'ho'] });
    await publish('Hai', { hashtags: ['sot'], thoiDiemXuatBan: at(1) });
    await af.published({
      tacGiaId: adminId,
      tieuDe: 'Nháp',
      trangThai: 'BanNhap',
      hashtags: ['ho', 'chi-nhap', 'sot'],
      thoiDiemXuatBan: null,
    });
    await af.published({
      tacGiaId: adminId,
      tieuDe: 'Lưu trữ',
      trangThai: 'LuuTruAn',
      hashtags: ['ho', 'chi-luu-tru'],
    });
    expect((await service.popularTags()).items).toEqual([
      { ten: 'sot', soBai: 2 },
      { ten: 'ho', soBai: 1 },
    ]);
  });

  it('ABP-08: ẩn hết bài của một thẻ thì thẻ biến mất; không bài nào thì rỗng', async () => {
    expect((await service.popularTags()).items).toEqual([]);
    const id = await publish('Duy nhất', { hashtags: ['sot'] });
    expect((await service.popularTags()).items).toEqual([
      { ten: 'sot', soBai: 1 },
    ]);
    await db.query(
      "UPDATE bai_viet SET trang_thai = 'LuuTruAn' WHERE bai_viet_id = ?",
      [id],
    );
    expect((await service.popularTags()).items).toEqual([]);
  });
});

describe('chỉ đọc (ABP-09)', () => {
  it('ABP-09: chèn bài đã xuất bản giữa hai câu của MỘT lời gọi danh sách ⇒ total khớp items (cùng một ảnh chụp, không lẫn bài mới)', async () => {
    await publish('Có sẵn một', { thoiDiemXuatBan: at(1) });
    await publish('Có sẵn hai', { thoiDiemXuatBan: at(2) });
    let inserted = false;
    const sql = captureSql(async () => {
      if (inserted) return;
      inserted = true;
      // kết nối KHÁC (DataSource) chèn và commit ngay sau câu đọc đầu tiên của lời gọi
      await publish('Chèn giữa chừng', { thoiDiemXuatBan: at(3) });
    });
    const page = await list();
    expect(inserted).toBe(true);
    expect(sql.length).toBeGreaterThanOrEqual(2);
    expect(page.items.map((i) => i.tieuDe)).toEqual([
      'Có sẵn hai',
      'Có sẵn một',
    ]);
    expect(page.total).toBe(page.items.length);
    // ngoài lời gọi, bài chèn đã thật sự có (không phải hook không chạy)
    expect((await list()).total).toBe(3);
  });

  it.each([
    ['danh sách', () => list()],
    ['chi tiết', async () => service.detail(await publish('Để xem chi tiết'))],
    ['thẻ phổ biến', () => service.popularTags()],
  ])(
    'ABP-09: %s chạy trong giao dịch READ ONLY: thử INSERT bằng chính manager của lời gọi bị MySQL từ chối (errno 1792) và không ghi gì',
    async (_name, call) => {
      await publish('Có bài', { hashtags: ['ho'] });
      const outcome: { errno?: number | undefined; probed: boolean } = {
        probed: false,
      };
      captureSql(async (_sql, manager) => {
        if (outcome.probed) return;
        outcome.probed = true;
        outcome.errno = await writeProbe(manager);
      });
      await call();
      expect(outcome.probed).toBe(true);
      expect(outcome.errno).toBe(1792);
      expect((await af.allHashtags()).map((t) => t.ten)).toEqual(['ho']);
    },
  );
});

describe('không đọc nội dung ở danh sách, không N+1 (ABP-10)', () => {
  it('ABP-10: không câu SQL nào của danh sách chứa noi_dung; số câu không tăng theo số bài (tối đa 3: bài, đếm, thẻ); chi tiết thì CÓ noi_dung (đối chứng)', async () => {
    await af.publishedMany(adminId, 2);
    const few = captureSql();
    await list();
    const fewCount = few.length;
    vi.restoreAllMocks();
    await af.publishedMany(adminId, 7, 'Thêm');
    const many = captureSql();
    await list({ pageSize: 9 });
    expect(many.length).toBe(fewCount);
    expect(many.length).toBeLessThanOrEqual(3);
    for (const statement of [...few, ...many])
      expect(statement).not.toContain('noi_dung');
    vi.restoreAllMocks();
    const detail = captureSql();
    await service.detail((await list()).items[0]!.baiVietId);
    expect(detail.some((statement) => statement.includes('noi_dung'))).toBe(
      true,
    );
  });
});

describe('dữ liệu lệch (ABP-12)', () => {
  it('ABP-12: bài DaXuatBan mà thoi_diem_xuat_ban NULL ⇒ không lỗi, xếp CUỐI (nhiều bài NULL: id giảm), thoiDiemXuatBan là null; bài có thời điểm vẫn theo thứ tự', async () => {
    const a = await publish('Có giờ cũ', { thoiDiemXuatBan: at(0) });
    const b = await publish('Lệch một', { thoiDiemXuatBan: null });
    const c = await publish('Có giờ mới', { thoiDiemXuatBan: at(10) });
    const d = await publish('Lệch hai', { thoiDiemXuatBan: null });
    const page = await list();
    expect(page.items.map((i) => i.baiVietId)).toEqual([c, a, d, b]);
    expect(page.items.map((i) => i.thoiDiemXuatBan)).toEqual([
      at(10).toISOString(),
      at(0).toISOString(),
      null,
      null,
    ]);
    expect(page.total).toBe(4);
  });

  it('ABP-12: chi tiết của bài lệch trả 200 với thoiDiemXuatBan null (không 500)', async () => {
    const id = await publish('Lệch', { thoiDiemXuatBan: null });
    expect((await service.detail(id)).thoiDiemXuatBan).toBeNull();
  });
});
