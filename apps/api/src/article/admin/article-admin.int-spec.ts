import { onTestFinished } from 'vitest';
import { EntityManager, type DataSource } from 'typeorm';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import type { AppException } from '../../common/errors/app.exception.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import {
  ArticleFixtures,
  createGate,
  rejection,
  waitForBlockedStatement,
  waitUntilReached,
} from '../testing/article-fixtures.js';
import {
  ArticleListQueryDto,
  CreateArticleDto,
  HashtagSuggestQueryDto,
  UpdateArticleDto,
} from './article-admin.dto.js';
import { ArticleAdminRepository } from './article-admin.repository.js';
import { ArticleAdminService } from './article-admin.service.js';
import { HashtagAdminService } from './hashtag-admin.service.js';
import { HashtagRepository } from './hashtag.repository.js';

// article B1 — tích hợp trên MySQL 8.4 THẬT cho service quản trị bài viết (PLAN article 7.2 đến 7.5): ABQ-02 (phạm vi hỏng), ABV-09 (hai người đổi trạng thái, ca cổng), ABV-13 (hoàn tác trọn),
// ABT-04 đến ABT-07 và ABT-11 (thẻ: dùng lại, chạy đua, thứ tự khoá, trùng khác dấu, thẻ tắt), cùng ca đồng hồ giả và múi giờ. Chạy ở CẢ TZ=UTC và TZ=Asia/Ho_Chi_Minh.
// Ca cổng: giữ MỘT giao dịch giữa hai bước để chứng minh khoá (nếp "đo khoá giữa giao dịch bằng cổng"); `waitForBlockedStatement` chứng minh giao dịch kia thật sự bị chặn.
let db: DataSource;
let fx: AdminFixtures;
let af: ArticleFixtures;
let service: ArticleAdminService;
let suggestions: HashtagAdminService;
let adminId: string;
useIntegrationHooks((d) => {
  db = d;
  fx = new AdminFixtures(d);
  af = new ArticleFixtures(d);
  const hashtags = new HashtagRepository(d);
  const policy = new BranchAccessPolicy();
  service = new ArticleAdminService(
    new ArticleAdminRepository(d),
    hashtags,
    policy,
  );
  suggestions = new HashtagAdminService(hashtags, policy);
});
beforeEach(async () => {
  adminId = (await fx.admin()).account.taiKhoanId;
});

const SYSTEM: AdminScope = { kind: 'ToanHeThong' };
const HOLD_MS = 50;
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const create = (over: Partial<CreateArticleDto> = {}): CreateArticleDto =>
  Object.assign(new CreateArticleDto(), {
    tieuDe: 'Sốt xuất huyết',
    noiDung: 'Nội dung',
    hashtag: [] as string[],
    trangThai: 'BanNhap' as const,
    ...over,
  });
const patch = (over: Partial<UpdateArticleDto>): UpdateArticleDto =>
  Object.assign(new UpdateArticleDto(), over);

/** Thay `EntityManager.query` bằng bản chạy thật rồi gọi `after(sql)`: chỗ để giữ giao dịch (cổng) hay ghi lại câu SQL. */
function spyOnQueries(after: (sql: string) => Promise<void> | void): void {
  // Giữ bản gốc để gọi lại bên trong bản giả (luôn gọi bằng `.call(this, …)`), nên việc tham chiếu hàm chưa gắn `this` là chủ ý
  // oxlint-disable-next-line typescript/unbound-method
  const real = EntityManager.prototype.query;
  vi.spyOn(EntityManager.prototype, 'query').mockImplementation(async function (
    this: EntityManager,
    sql: string,
    parameters?: unknown[],
  ) {
    const result: unknown = await real.call(this, sql, parameters);
    await after(sql);
    return result;
  } as never);
}

describe('phạm vi hỏng vào service (ABQ-02)', () => {
  it.each([
    ['kind lạ', { kind: 'Khac' }],
    ['ChiNhanh thiếu chiNhanhId', { kind: 'ChiNhanh' }],
    ['ChiNhanh đủ chiNhanhId', { kind: 'ChiNhanh', chiNhanhId: '1' }],
  ])(
    'ABQ-02: %s: mọi hàm của service ném 403 KHONG_DU_QUYEN và KHÔNG ghi gì (bốn bảng và bài có sẵn nguyên vẹn)',
    async (_name, forged) => {
      const scope = forged as unknown as AdminScope;
      const id = await af.article({ tacGiaId: adminId, tieuDe: 'Có sẵn' });
      await af.attach(id, await af.hashtag('ho'));
      const before = await af.rowCounts();
      const rowBefore = await af.articleRow(id);

      // Mỗi lời gọi chỉ được TẠO khi tới lượt (không tạo sẵn cả mảng, tránh promise bị từ chối mà chưa có nơi nhận)
      const calls: [string, () => Promise<unknown>][] = [
        ['list', () => service.list(scope, new ArticleListQueryDto())],
        ['get', () => service.get(scope, id)],
        [
          'create',
          () => service.create(scope, adminId, create({ hashtag: ['moi'] })),
        ],
        [
          'update',
          () => service.update(scope, id, patch({ tieuDe: 'Bị đổi' })),
        ],
        [
          'suggest',
          () => suggestions.suggest(scope, new HashtagSuggestQueryDto()),
        ],
      ];
      for (const [name, run] of calls) {
        const error = await rejection(run());
        expect(error.maLoi, name).toBe('KHONG_DU_QUYEN');
        expect(error.getStatus(), name).toBe(403);
      }
      expect(await af.rowCounts()).toEqual(before);
      expect(await af.articleRow(id)).toEqual(rowBefore);
    },
  );
});

describe('thẻ khi lưu bài (ABT-04, ABT-05, ABT-06, ABT-07, ABT-11)', () => {
  it('ABT-04: thẻ chưa có được tạo mới; thẻ đã có được dùng lại đúng hashtag_id, không sinh bản sao', async () => {
    const first = await service.create(
      SYSTEM,
      adminId,
      create({ tieuDe: 'A', hashtag: ['Ho', 'sốt'] }),
    );
    expect(first.hashtag).toEqual(['ho', 'sốt']);
    const [{ hashtagId: idHo }] = (await db.query(
      "SELECT CAST(hashtag_id AS CHAR) AS hashtagId FROM hashtag WHERE ten = 'ho'",
    )) as [{ hashtagId: string }];

    const second = await service.create(
      SYSTEM,
      adminId,
      create({ tieuDe: 'B', hashtag: ['sốt', 'HO', 'mới'] }),
    );
    expect(second.hashtag).toEqual(['ho', 'mới', 'sốt']);
    expect(await af.allHashtags()).toEqual([
      { ten: 'ho', hoatDong: true },
      { ten: 'mới', hoatDong: true },
      { ten: 'sốt', hoatDong: true },
    ]);
    const used: { hashtagId: string }[] = await db.query(
      "SELECT CAST(bh.hashtag_id AS CHAR) AS hashtagId FROM bai_viet_hashtag bh JOIN hashtag h ON h.hashtag_id = bh.hashtag_id WHERE h.ten = 'ho' ORDER BY bh.bai_viet_id",
    );
    expect(used).toEqual([{ hashtagId: idHo }, { hashtagId: idHo }]);
  });

  it('ABT-05: hai yêu cầu cùng tạo một thẻ mới (ca cổng: A chèn thẻ rồi giữ trước commit, B bị chặn ở UNIQUE): một dòng hashtag, cả hai thành công, không lỗi 500', async () => {
    const gate = createGate();
    // Dù ca đỏ giữa chừng cũng mở cổng: giao dịch bị giữ phải kết thúc kẻo giữ khoá làm hook TRUNCATE của ca sau treo
    onTestFinished(() => gate.open());
    let attachCalls = 0;
    // Giữ bản gốc để gọi lại bên trong bản giả (luôn gọi bằng `.call(this, …)`), nên việc tham chiếu hàm chưa gắn `this` là chủ ý
    // oxlint-disable-next-line typescript/unbound-method
    const real = HashtagRepository.prototype.attach;
    vi.spyOn(HashtagRepository.prototype, 'attach').mockImplementation(
      async function (this: HashtagRepository, manager, articleId, ids) {
        attachCalls += 1;
        if (attachCalls === 1) {
          gate.markReached();
          await gate.opened;
        }
        return real.call(this, manager, articleId, ids);
      },
    );
    const a = service.create(
      SYSTEM,
      adminId,
      create({ tieuDe: 'A', hashtag: ['moi'] }),
    );
    await waitUntilReached(gate, a);
    const b = service.create(
      SYSTEM,
      adminId,
      create({ tieuDe: 'B', hashtag: ['moi'] }),
    );
    // B bị chặn ở UNIQUE của hashtag.ten: câu INSERT thẻ của B chạy quá 1 giây trong PROCESSLIST (innodb_trx không liệt kê giao dịch chờ này)
    await waitForBlockedStatement(db, 'INSERT INTO hashtag%');
    gate.open();
    const [viewA, viewB] = await Promise.all([a, b]);

    expect(viewA.hashtag).toEqual(['moi']);
    expect(viewB.hashtag).toEqual(['moi']);
    expect(await af.allHashtags()).toEqual([{ ten: 'moi', hoatDong: true }]);
    expect((await af.rowCounts()).bai_viet_hashtag).toBe(2);
  });

  it('ABT-06: hai yêu cầu thẻ chéo thứ tự (x,y và y,x), giữ 50 ms sau mỗi lần chèn thẻ: không deadlock, cả hai thành công (bắt đột biến "không sắp thẻ trước khi chèn")', async () => {
    spyOnQueries(async (sql) => {
      if (sql.startsWith('INSERT INTO hashtag')) await sleep(HOLD_MS);
    });
    const [viewA, viewB] = await Promise.all([
      service.create(
        SYSTEM,
        adminId,
        create({ tieuDe: 'A', hashtag: ['x', 'y'] }),
      ),
      service.create(
        SYSTEM,
        adminId,
        create({ tieuDe: 'B', hashtag: ['y', 'x'] }),
      ),
    ]);
    expect(viewA.hashtag).toEqual(['x', 'y']);
    expect(viewB.hashtag).toEqual(['x', 'y']);
    expect((await af.allHashtags()).map((t) => t.ten)).toEqual(['x', 'y']);
  });

  it('ABT-06: khoá sắp xếp gập dấu: A (mắt, mắu) và B (mắu, mặt) khoá chéo nếu sắp theo chuỗi thô vì mắt và mặt là CÙNG một khoá UNIQUE; sắp gập dấu thì không deadlock, A thành công và B nhận 409 trùng khác dấu', async () => {
    const firstInsert = createGate();
    let marked = false;
    spyOnQueries(async (sql) => {
      if (!sql.startsWith('INSERT INTO hashtag')) return;
      if (!marked) {
        marked = true;
        firstInsert.markReached();
      }
      await sleep(HOLD_MS);
    });
    const a = service.create(
      SYSTEM,
      adminId,
      create({ tieuDe: 'A', hashtag: ['mắt', 'mắu'] }),
    );
    await waitUntilReached(firstInsert, a);
    const b = service.create(
      SYSTEM,
      adminId,
      create({ tieuDe: 'B', hashtag: ['mắu', 'mặt'] }),
    );
    const [resultA, resultB] = await Promise.allSettled([a, b]);

    expect(
      resultA.status,
      resultA.status === 'rejected' ? String(resultA.reason) : '',
    ).toBe('fulfilled');
    expect(resultB.status).toBe('rejected');
    const reason = (resultB as PromiseRejectedResult).reason as AppException;
    expect(reason.maLoi, String(reason)).toBe('THE_TRUNG_KHONG_DAU');
    expect(reason.getResponse()).toMatchObject({
      chiTiet: { theDaCo: 'mắt' },
    });
    expect(await af.rowCounts()).toMatchObject({
      bai_viet: 1,
      hashtag: 2,
      bai_viet_hashtag: 2,
    });
  });

  it('ABT-07: thẻ trùng theo collation nhưng khác dấu với thẻ đã có (mặt, mat khi đã có mắt): 409 THE_TRUNG_KHONG_DAU kèm tên đang lưu, KHÔNG ghi gì (bài mới không lưu)', async () => {
    await service.create(
      SYSTEM,
      adminId,
      create({ tieuDe: 'A', hashtag: ['mắt'] }),
    );
    const before = await af.rowCounts();
    for (const variant of ['mặt', 'mat']) {
      const error = await rejection(
        service.create(
          SYSTEM,
          adminId,
          create({ tieuDe: 'B', hashtag: ['ho', variant] }),
        ),
      );
      expect(error.maLoi, variant).toBe('THE_TRUNG_KHONG_DAU');
      expect(error.getStatus(), variant).toBe(409);
      expect((error.getResponse() as { chiTiet: unknown }).chiTiet).toEqual({
        theDaCo: 'mắt',
      });
      // Thẻ "ho" tạo trước đó trong cùng giao dịch cũng bị hoàn tác
      expect(await af.rowCounts()).toEqual(before);
    }
  });

  it('ABT-07 (ca âm): đau rồi dau là HAI chữ khác nhau ở collation (đ khác d, kết quả đo ABD-04): cả hai thẻ đều được tạo, KHÔNG 409 (nhánh trùng khác dấu không chặn nhầm)', async () => {
    const a = await service.create(
      SYSTEM,
      adminId,
      create({ tieuDe: 'A', hashtag: ['đau'] }),
    );
    const b = await service.create(
      SYSTEM,
      adminId,
      create({ tieuDe: 'B', hashtag: ['dau'] }),
    );
    expect(a.hashtag).toEqual(['đau']);
    expect(b.hashtag).toEqual(['dau']);
    expect((await af.allHashtags()).map((t) => t.ten).sort()).toEqual([
      'dau',
      'đau',
    ]);
  });

  it('ABT-07: sửa bài (PATCH) sang thẻ khác dấu cũng 409 và bài giữ nguyên thẻ cũ', async () => {
    await service.create(
      SYSTEM,
      adminId,
      create({ tieuDe: 'A', hashtag: ['mắt'] }),
    );
    const b = await service.create(
      SYSTEM,
      adminId,
      create({ tieuDe: 'B', hashtag: ['ho'] }),
    );
    const error = await rejection(
      service.update(SYSTEM, b.baiVietId, patch({ hashtag: ['ho', 'mặt'] })),
    );
    expect(error.maLoi).toBe('THE_TRUNG_KHONG_DAU');
    expect(await af.tagNamesOf(b.baiVietId)).toEqual(['ho']);
  });

  it('ABT-11: gắn vào bài một thẻ đã có nhưng đang tắt: 409 THE_DA_TAT kèm tên thẻ, KHÔNG bật lại (cột vẫn tắt), bài không lưu', async () => {
    await af.hashtag('da-tat', false);
    const before = await af.rowCounts();
    const error = await rejection(
      service.create(SYSTEM, adminId, create({ hashtag: ['ho', 'Da-Tat'] })),
    );
    expect(error.maLoi).toBe('THE_DA_TAT');
    expect(error.getStatus()).toBe(409);
    expect((error.getResponse() as { chiTiet: unknown }).chiTiet).toEqual({
      theDaCo: 'da-tat',
    });
    expect(await af.allHashtags()).toEqual([
      { ten: 'da-tat', hoatDong: false },
    ]);
    expect(await af.rowCounts()).toEqual(before);
  });

  it('ABT-11: thêm thẻ tắt vào bài chưa gắn nó (PATCH) bị 409; bài ĐÃ gắn sẵn thẻ đó rồi bị tắt thì sửa giữ nguyên thẻ vẫn 200 (chỉ gắn MỚI mới bị chặn)', async () => {
    const noTag = await af.article({ tacGiaId: adminId, tieuDe: 'Chưa gắn' });
    const withTag = await af.article({ tacGiaId: adminId, tieuDe: 'Đã gắn' });
    const theId = await af.hashtag('da-tat', true);
    await af.attach(withTag, theId);
    await db.query(
      'UPDATE hashtag SET trang_thai_hoat_dong = 0 WHERE hashtag_id = ?',
      [theId],
    );

    const blocked = await rejection(
      service.update(SYSTEM, noTag, patch({ hashtag: ['da-tat'] })),
    );
    expect(blocked.maLoi).toBe('THE_DA_TAT');
    expect(await af.tagNamesOf(noTag)).toEqual([]);

    const kept = await service.update(
      SYSTEM,
      withTag,
      patch({ tieuDe: 'Đã sửa', hashtag: ['da-tat'] }),
    );
    expect(kept.tieuDe).toBe('Đã sửa');
    expect(kept.hashtag).toEqual(['da-tat']);
    expect(await af.allHashtags()).toEqual([
      { ten: 'da-tat', hoatDong: false },
    ]);
  });
});

describe('đổi trạng thái đồng thời và hoàn tác trọn (ABV-09, ABV-13)', () => {
  it('ABV-09: hai Quản trị viên xuất bản và lưu trữ cùng một bài (ca cổng: A giữ khoá hàng sau FOR UPDATE, B chờ): không lỗi, kết quả là thứ tự A rồi B, thoi_diem_xuat_ban đặt đúng một lần', async () => {
    const id = await af.article({ tacGiaId: adminId, noiDung: 'Có nội dung' });
    const gate = createGate();
    // Dù ca đỏ giữa chừng cũng mở cổng: giao dịch bị giữ phải kết thúc kẻo giữ khoá làm hook TRUNCATE của ca sau treo
    onTestFinished(() => gate.open());
    let lockCalls = 0;
    // Giữ bản gốc để gọi lại bên trong bản giả (luôn gọi bằng `.call(this, …)`), nên việc tham chiếu hàm chưa gắn `this` là chủ ý
    // oxlint-disable-next-line typescript/unbound-method
    const real = ArticleAdminRepository.prototype.lock;
    vi.spyOn(ArticleAdminRepository.prototype, 'lock').mockImplementation(
      async function (this: ArticleAdminRepository, manager, articleId) {
        const row = await real.call(this, manager, articleId);
        lockCalls += 1;
        if (lockCalls === 1) {
          gate.markReached();
          await gate.opened;
        }
        return row;
      },
    );
    const a = service.update(SYSTEM, id, patch({ trangThai: 'DaXuatBan' }));
    await waitUntilReached(gate, a);
    const b = service.update(SYSTEM, id, patch({ trangThai: 'LuuTruAn' }));
    await waitForBlockedStatement(
      db,
      '%FROM bai_viet WHERE bai_viet_id =%FOR UPDATE',
    );
    gate.open();
    const [viewA, viewB] = await Promise.all([a, b]);

    expect(viewA.trangThai).toBe('DaXuatBan');
    expect(viewB.trangThai).toBe('LuuTruAn');
    const row = await af.articleRow(id);
    expect(row?.trangThai).toBe('LuuTruAn');
    // Đồng hồ giả đứng ở 08:00 giờ Việt Nam; B thấy bài đã xuất bản nên KHÔNG đặt lại thời điểm
    expect(row?.thoiDiemXuatBan).toBe('2026-11-02 08:00:00');
    expect(viewB.thoiDiemXuatBan).toBe(viewA.thoiDiemXuatBan);
  });

  it('ABV-13: ép lỗi giữa chừng khi gắn thẻ lúc TẠO: không bài, không thẻ mới, không dòng nối nào', async () => {
    vi.spyOn(HashtagRepository.prototype, 'attach').mockRejectedValueOnce(
      new Error('ép lỗi giữa chừng'),
    );
    await expect(
      service.create(SYSTEM, adminId, create({ hashtag: ['moi', 'ho'] })),
    ).rejects.toThrow('ép lỗi giữa chừng');
    expect(await af.rowCounts()).toEqual({
      bai_viet: 0,
      hashtag: 0,
      bai_viet_hashtag: 0,
      benh_nhan_danh_gia_bai_viet: 0,
    });
  });

  it('ABV-13: ép lỗi giữa chừng khi SỬA: tiêu đề, thẻ cũ và thẻ mới đều như trước (không còn thẻ mới tạo dở)', async () => {
    const id = await af.article({ tacGiaId: adminId, tieuDe: 'Cũ' });
    await af.attach(id, await af.hashtag('cu'));
    const before = await af.rowCounts();
    vi.spyOn(HashtagRepository.prototype, 'attach').mockRejectedValueOnce(
      new Error('ép lỗi giữa chừng'),
    );
    await expect(
      service.update(
        SYSTEM,
        id,
        patch({
          tieuDe: 'Mới',
          hashtag: ['cu', 'moi'],
          trangThai: 'DaXuatBan',
        }),
      ),
    ).rejects.toThrow('ép lỗi giữa chừng');
    expect((await af.articleRow(id))?.tieuDe).toBe('Cũ');
    expect((await af.articleRow(id))?.trangThai).toBe('BanNhap');
    expect(await af.tagNamesOf(id)).toEqual(['cu']);
    expect(await af.rowCounts()).toEqual(before);
  });
});

describe('đồng hồ giả và múi giờ (ABV-03, ABV-05)', () => {
  it('B4-I6 kiểu chatbot: TZ có hiệu lực thật (UTC thì lệch 0 phút, Asia/Ho_Chi_Minh thì −420 phút); không đặt TZ thì không khẳng định gì', () => {
    const expected: Record<string, number> = {
      UTC: 0,
      'Asia/Ho_Chi_Minh': -420,
    };
    const want = expected[process.env.TZ ?? ''];
    if (want !== undefined) expect(new Date().getTimezoneOffset()).toBe(want);
  });

  it('ABV-03: thoi_diem_tao, cap_nhat_lan_cuoi và thoi_diem_xuat_ban theo đồng hồ giả, cắt giây, giờ Việt Nam: như nhau dù tiến trình chạy ở TZ nào', async () => {
    vi.setSystemTime(new Date('2026-11-05T09:30:45.678Z'));
    const view = await service.create(
      SYSTEM,
      adminId,
      create({ trangThai: 'DaXuatBan' }),
    );
    expect(view.thoiDiemTao).toBe('2026-11-05T09:30:45.000Z');
    expect(view.capNhatLanCuoi).toBe('2026-11-05T09:30:45.000Z');
    expect(view.thoiDiemXuatBan).toBe('2026-11-05T09:30:45.000Z');
    const row = await af.articleRow(view.baiVietId);
    expect(row).toMatchObject({
      thoiDiemTao: '2026-11-05 16:30:45',
      capNhatLanCuoi: '2026-11-05 16:30:45',
      thoiDiemXuatBan: '2026-11-05 16:30:45',
    });
  });

  it('ABV-05: lưu trữ rồi xuất bản lại ở thời điểm khác: thoi_diem_xuat_ban giữ nguyên, cap_nhat_lan_cuoi theo đồng hồ mới', async () => {
    const view = await service.create(
      SYSTEM,
      adminId,
      create({ trangThai: 'DaXuatBan' }),
    );
    vi.setSystemTime(new Date('2026-11-09T02:00:00.000Z'));
    await service.update(
      SYSTEM,
      view.baiVietId,
      patch({ trangThai: 'LuuTruAn' }),
    );
    vi.setSystemTime(new Date('2026-11-12T03:00:00.000Z'));
    const again = await service.update(
      SYSTEM,
      view.baiVietId,
      patch({ trangThai: 'DaXuatBan' }),
    );
    expect(again.thoiDiemXuatBan).toBe(view.thoiDiemXuatBan);
    expect(again.capNhatLanCuoi).toBe('2026-11-12T03:00:00.000Z');
    expect((await af.articleRow(view.baiVietId))?.thoiDiemXuatBan).toBe(
      '2026-11-02 08:00:00',
    );
  });
});

describe('danh sách và gợi ý dùng SQL đúng (ABV-12, ABT-08)', () => {
  it('ABV-12: câu SQL của danh sách KHÔNG chứa cột noi_dung và không khoá hàng (chỉ đọc); chi tiết thì đọc noi_dung', async () => {
    const id = await af.article({ tacGiaId: adminId, noiDung: 'Rất dài' });
    const seen: string[] = [];
    spyOnQueries((sql) => {
      seen.push(sql);
    });
    const list = await service.list(
      SYSTEM,
      Object.assign(new ArticleListQueryDto(), { q: 'mẫu', the: 'ho' }),
    );
    expect(list.items).toEqual([]);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    for (const sql of seen) {
      expect(sql, sql).not.toContain('noi_dung');
      expect(sql, sql).not.toMatch(/FOR\s+(UPDATE|SHARE)/i);
    }
    seen.length = 0;
    await service.get(SYSTEM, id);
    expect(seen.some((sql) => sql.includes('noi_dung'))).toBe(true);
  });

  it('ABT-08: gợi ý khớp tiền tố không phân biệt hoa thường và dấu, chỉ thẻ hoạt động, tối đa limit, sắp theo tên', async () => {
    await af.hashtag('mắt');
    await af.hashtag('mật-ong');
    await af.hashtag('mat-na', false);
    await af.hashtag('khác');
    const run = (q: string | undefined, limit = 10) =>
      suggestions.suggest(
        SYSTEM,
        Object.assign(new HashtagSuggestQueryDto(), { q, limit }),
      );
    expect((await run('MA')).items.map((i) => i.ten).sort()).toEqual(
      ['mắt', 'mật-ong'].sort(),
    );
    expect((await run('ma', 1)).items).toHaveLength(1);
    expect((await run('#kh')).items).toEqual([{ ten: 'khác' }]);
    expect((await run('a/b')).items).toEqual([]);
    expect((await run(undefined)).items).toHaveLength(3);
  });
});
