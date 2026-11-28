import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AdminFixtures } from '../src/admin/testing/admin-fixtures.js';
import { ArticleFixtures } from '../src/article/testing/article-fixtures.js';
import { insertTaiKhoan } from '../src/auth/entities/testing/auth-fixtures.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';

// article B2 — HTTP qua AppModule + MySQL thật cho API công khai bài viết (PLAN article 7.2, 7.4, 7.6): ABQ-03, ABQ-04 (chỉ bài đã xuất bản, 404 cùng thân), ABT-09 (lọc một thẻ),
// ABP-01 đến ABP-08 và ABP-11, cùng header `Cache-Control: no-cache` (T10) và việc route quản trị vẫn `no-store` (ca T10 của B1). Chỉ chạy ở TZ=Asia/Ho_Chi_Minh (`validateEnv` của AppModule);
// ca ngày giờ hai múi giờ nằm ở `src/article/public/article-public.int-spec.ts`. Thời điểm xuất bản chèn bằng instant biết trước nên không cần đồng hồ giả.
const T1 = new Date('2026-11-05T02:30:00.000Z');
const MINUTE = 60_000;
const at = (minutes: number): Date => new Date(T1.getTime() + minutes * MINUTE);
const NO_CACHE = 'no-cache';
const AUTHOR_NAME = 'Nguyễn Tác Giả Kín';
const AUTHOR_EMAIL = 'tac.gia.kin@example.test';

describe('article B2 — API công khai bài viết (HTTP)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: AdminFixtures;
  let af: ArticleFixtures;
  let sessions: SessionService;
  let authorId: string;
  const tokens = {} as Record<'system' | 'patient', string>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    fx = new AdminFixtures(db);
    af = new ArticleFixtures(db);
    sessions = app.get(SessionService);
  });
  beforeEach(async () => {
    await resetTables(db);
    const author = await fx.admin(undefined, {
      hoTen: AUTHOR_NAME,
      email: AUTHOR_EMAIL,
    });
    authorId = author.account.taiKhoanId;
    tokens.system = (await sessions.create(authorId)).accessToken;
    const patient = await insertTaiKhoan(db, {
      loaiTaiKhoan: 'BenhNhan',
      daXacMinhEmail: true,
    });
    tokens.patient = (await sessions.create(patient.taiKhoanId)).accessToken;
  });
  afterAll(async () => app?.close());

  /** GET không đăng nhập (mặc định), hay kèm token. */
  const get = (path: string, token?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return token ? req.auth(token, { type: 'bearer' }) : req;
  };
  const publish = (
    tieuDe: string,
    extra: Partial<Parameters<ArticleFixtures['published']>[0]> = {},
  ) =>
    af.published({ tacGiaId: authorId, tieuDe, thoiDiemXuatBan: T1, ...extra });
  const draft = (tieuDe: string, hashtags: string[] = []) =>
    af.published({
      tacGiaId: authorId,
      tieuDe,
      trangThai: 'BanNhap',
      thoiDiemXuatBan: null,
      hashtags,
    });
  const archived = (tieuDe: string, hashtags: string[] = []) =>
    af.published({
      tacGiaId: authorId,
      tieuDe,
      trangThai: 'LuuTruAn',
      hashtags,
    });
  const titlesOf = (body: { items: { tieuDe: string }[] }): string[] =>
    body.items.map((item) => item.tieuDe);

  describe('chỉ bài đã xuất bản, 404 cùng thân (ABQ-03, ABQ-04)', () => {
    it('ABQ-03: chi tiết của BanNhap, LuuTruAn, id không có, abc, 0, -1, 20 chữ số, id kèm slug, vượt BIGINT ⇒ 404 KHONG_TIM_THAY CÙNG thân (trừ requestId); khách, Bệnh nhân và Quản trị viên đều vậy', async () => {
      const nhap = await draft('Bản nháp');
      const luuTru = await archived('Bản lưu trữ');
      const ids = [
        nhap,
        luuTru,
        '987654321',
        'abc',
        '0',
        '-1',
        '12345678901234567890',
        '5-sot-xuat-huyet',
        '9999999999999999999',
      ];
      const bodies: unknown[] = [];
      for (const token of [undefined, tokens.patient, tokens.system])
        for (const id of ids) {
          const response = await get(`/public/articles/${id}`, token);
          const body = expectErrorResponse(response, 404, 'KHONG_TIM_THAY');
          expect(response.headers['cache-control']).toBe(NO_CACHE);
          const { requestId: _ignored, ...rest } = body;
          bodies.push(rest);
        }
      for (const body of bodies) expect(body).toEqual(bodies[0]);
    });

    it('ABQ-03: chi tiết của bài nháp kèm ?trangThai=BanNhap vẫn 404 (route chi tiết bỏ qua khoá lạ, không bao giờ mở bài chưa xuất bản)', async () => {
      const nhap = await draft('Bản nháp');
      expectErrorResponse(
        await get(`/public/articles/${nhap}?trangThai=BanNhap`),
        404,
        'KHONG_TIM_THAY',
      );
    });

    it('ABQ-04: danh sách có ba trạng thái, q và the khớp cả bản nháp và bản lưu trữ ⇒ chỉ DaXuatBan, dù gọi bằng khách hay Quản trị viên', async () => {
      await publish('Sốt xuất huyết', { hashtags: ['ho'] });
      await draft('Sốt nháp', ['ho']);
      await archived('Sốt lưu trữ', ['ho']);
      for (const token of [undefined, tokens.system])
        for (const path of [
          '/public/articles',
          '/public/articles?q=sốt',
          '/public/articles?the=ho',
          '/public/articles?q=s%E1%BB%91t&the=ho',
        ]) {
          const response = await get(path, token).expect(200);
          expect(titlesOf(response.body), path).toEqual(['Sốt xuất huyết']);
          expect((response.body as { total: number }).total, path).toBe(1);
        }
    });

    it('ABQ-04: gửi trangThai=BanNhap (hay LuuTruAn) vào danh sách ⇒ 400 DU_LIEU_KHONG_HOP_LE, loi TRUONG_KHONG_DUOC_PHEP', async () => {
      await draft('Nháp');
      for (const status of ['BanNhap', 'LuuTruAn', 'DaXuatBan']) {
        const body = expectErrorResponse(
          await get(`/public/articles?trangThai=${status}`),
          400,
          'DU_LIEU_KHONG_HOP_LE',
        );
        expect(body.loi).toContainEqual({
          truong: 'trangThai',
          ma: 'TRUONG_KHONG_DUOC_PHEP',
        });
      }
    });

    it('ABQ-03: route công khai không cần đăng nhập và bỏ qua token (token rác cũng 200)', async () => {
      await publish('Công khai');
      await get('/public/articles').expect(200);
      await get('/public/articles', 'token-rac').expect(200);
      expect((await get('/public/article-tags', 'token-rac')).status).toBe(200);
    });
  });

  describe('lọc một thẻ (ABT-09)', () => {
    beforeEach(async () => {
      await publish('Ho kéo dài', { hashtags: ['ho'], thoiDiemXuatBan: at(1) });
      await publish('Sốt cao', { hashtags: ['sot'], thoiDiemXuatBan: at(2) });
      await draft('Ho nháp', ['ho']);
    });

    it('ABT-09: the=ho chỉ ra bài đã xuất bản có thẻ ho; the được chuẩn hoá như khi lưu (HO, #ho, khoảng trắng)', async () => {
      for (const the of ['ho', 'HO', '%23ho', '%20ho%20', '%23%20Ho'])
        expect(
          titlesOf((await get(`/public/articles?the=${the}`).expect(200)).body),
          the,
        ).toEqual(['Ho kéo dài']);
    });

    it('ABT-09: thẻ đúng dạng nhưng không có ⇒ 200 rỗng, total 0 (không phải lỗi)', async () => {
      const empty = await get('/public/articles?the=khong-co').expect(200);
      expect(empty.body).toEqual({ items: [], total: 0, page: 1, pageSize: 9 });
    });

    it.each([
      ['ký tự <', 'a%3Cb'],
      ['dấu /', 'a%2Fb'],
      ['dấu gạch dưới', 'a_b'],
      ['emoji', '%F0%9F%98%80'],
      ['chỉ dấu gạch', '-'],
      ['rỗng', ''],
      ['chỉ khoảng trắng', '%20%20'],
      ['51 ký tự', 'a'.repeat(51)],
    ])(
      'ABT-09: the %s sai dạng ⇒ 400 BO_LOC_KHONG_HOP_LE kèm loi the/THE_KHONG_HOP_LE',
      async (_name, the) => {
        const body = expectErrorResponse(
          await get(`/public/articles?the=${the}`),
          400,
          'BO_LOC_KHONG_HOP_LE',
        );
        expect(body.loi).toEqual([{ truong: 'the', ma: 'THE_KHONG_HOP_LE' }]);
      },
    );
  });

  describe('danh sách (ABP-01, ABP-02, ABP-05)', () => {
    it('ABP-01: chỉ DaXuatBan, mới nhất trước, hoà thì id giảm; đúng 6 khoá, không noiDung, không tác giả; hashtag[] sắp theo tên', async () => {
      const cu = await publish('Cũ', { thoiDiemXuatBan: at(-60) });
      const hoaA = await publish('Hoà A', { thoiDiemXuatBan: at(0) });
      const hoaB = await publish('Hoà B', {
        thoiDiemXuatBan: at(0),
        hashtags: ['sot', 'ho'],
      });
      const moi = await publish('Mới', { thoiDiemXuatBan: at(60) });
      await draft('Nháp');
      await archived('Lưu trữ');
      const response = await get('/public/articles').expect(200);
      const body = response.body as {
        items: Record<string, unknown>[];
        total: number;
        page: number;
        pageSize: number;
      };
      expect(body.items.map((item) => item.baiVietId)).toEqual([
        moi,
        hoaB,
        hoaA,
        cu,
      ]);
      expect(body).toMatchObject({ total: 4, page: 1, pageSize: 9 });
      for (const item of body.items)
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
      expect(body.items[1]?.hashtag).toEqual(['ho', 'sot']);
      expect(body.items[0]?.thoiDiemXuatBan).toBe(at(60).toISOString());
      expect(JSON.stringify(body)).not.toMatch(
        new RegExp(`${AUTHOR_NAME}|${AUTHOR_EMAIL}|noiDung|tacGia`),
      );
    });

    it('ABP-02: mặc định 9 bài một trang; pageSize 30 nhận (31 bài trả 30); trang quá cuối ⇒ items rỗng, total đúng', async () => {
      await af.publishedMany(authorId, 31);
      const first = (await get('/public/articles').expect(200)).body as {
        items: unknown[];
        total: number;
        pageSize: number;
      };
      expect(first.items).toHaveLength(9);
      expect(first).toMatchObject({ total: 31, pageSize: 9 });
      const big = (await get('/public/articles?pageSize=30').expect(200))
        .body as { items: unknown[]; total: number; pageSize: number };
      expect(big.items).toHaveLength(30);
      expect(big).toMatchObject({ total: 31, pageSize: 30 });
      const last = (await get('/public/articles?page=4').expect(200)).body as {
        items: unknown[];
        total: number;
      };
      expect(last.items).toHaveLength(4);
      const beyond = (await get('/public/articles?page=99').expect(200))
        .body as { items: unknown[]; total: number; page: number };
      expect(beyond.items).toEqual([]);
      expect(beyond).toMatchObject({ total: 31, page: 99 });
    });

    it.each([
      ['31', 'pageSize=31'],
      ['0', 'pageSize=0'],
      ['âm', 'pageSize=-1'],
      ['chữ', 'pageSize=abc'],
      ['thập phân', 'pageSize=9.5'],
      ['rỗng', 'pageSize='],
      ['page 0', 'page=0'],
      ['page chữ', 'page=abc'],
    ])(
      'ABP-02: tham số %s (%s) ⇒ 400 DU_LIEU_KHONG_HOP_LE',
      async (_name, query) => {
        expectErrorResponse(
          await get(`/public/articles?${query}`),
          400,
          'DU_LIEU_KHONG_HOP_LE',
        );
      },
    );

    it('ABP-02: page=1e20 (offset vượt số nguyên an toàn) ⇒ 400 với loi page/TRANG_KHONG_HOP_LE, không 500', async () => {
      const body = expectErrorResponse(
        await get('/public/articles?page=1e20'),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
      expect(body.loi).toEqual([{ truong: 'page', ma: 'TRANG_KHONG_HOP_LE' }]);
    });

    it('ABP-05: không có bài khớp ⇒ 200, items rỗng, total 0, page và pageSize đúng (không phải lỗi)', async () => {
      await publish('Sốt xuất huyết');
      const response = await get('/public/articles?q=khong-co-bai-nay').expect(
        200,
      );
      expect(response.body).toEqual({
        items: [],
        total: 0,
        page: 1,
        pageSize: 9,
      });
    });
  });

  describe('tìm tiêu đề (ABP-03, ABP-04, ABP-11)', () => {
    beforeEach(async () => {
      for (const title of [
        'Trẻ em bị sốt',
        'Giảm 50% đường',
        'a_b',
        'aXb',
        'Ôi! Sốt',
      ])
        await publish(title);
    });
    const search = async (q: string) =>
      titlesOf(
        (await get(`/public/articles?q=${encodeURIComponent(q)}`).expect(200))
          .body,
      );

    it('ABP-03: q=tre em ra "Trẻ em bị sốt" (không phân biệt hoa thường và dấu); q ở dạng NFD (tách dấu) cũng ra; q có khoảng trắng hai đầu được cắt', async () => {
      expect(await search('tre em')).toEqual(['Trẻ em bị sốt']);
      expect(await search('TRẺ EM')).toEqual(['Trẻ em bị sốt']);
      expect(await search('Trẻ em'.normalize('NFD'))).toEqual([
        'Trẻ em bị sốt',
      ]);
      expect(await search('  trẻ em  ')).toEqual(['Trẻ em bị sốt']);
    });

    it('ABP-03: q chứa % hay _ hay ! khớp NGUYÊN VĂN ký tự đó (không phải ký tự đại diện, không lỗi cú pháp)', async () => {
      expect(await search('%')).toEqual(['Giảm 50% đường']);
      expect(await search('_')).toEqual(['a_b']);
      expect(await search('a_b')).toEqual(['a_b']);
      expect(await search('!')).toEqual(['Ôi! Sốt']);
    });

    it('ABP-03: q 100 ký tự nhận, 101 ký tự ⇒ 400 loi q/TU_KHOA_KHONG_HOP_LE', async () => {
      await get(`/public/articles?q=${'a'.repeat(100)}`).expect(200);
      const body = expectErrorResponse(
        await get(`/public/articles?q=${'a'.repeat(101)}`),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
      expect(body.loi).toEqual([{ truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' }]);
    });

    it('ABP-04: q cùng the là GIAO; hai the ⇒ 400', async () => {
      await publish('Sốt xuất huyết', {
        hashtags: ['sot'],
        thoiDiemXuatBan: at(1),
      });
      await publish('Sốt cao ở trẻ', {
        hashtags: ['tre-em'],
        thoiDiemXuatBan: at(2),
      });
      await publish('Ho gà', { hashtags: ['sot'], thoiDiemXuatBan: at(3) });
      expect(
        titlesOf(
          (await get('/public/articles?q=s%E1%BB%91t&the=sot').expect(200))
            .body,
        ),
      ).toEqual(['Sốt xuất huyết']);
      const body = expectErrorResponse(
        await get('/public/articles?the=sot&the=tre-em'),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
      expect(body.loi).toContainEqual({
        truong: 'the',
        ma: 'THE_KHONG_HOP_LE',
      });
    });

    it('ABP-11: khoá lạ trong query (tacGiaId, sapXep, chiNhanhId) ⇒ 400 TRUONG_KHONG_DUOC_PHEP từng khoá', async () => {
      for (const key of ['tacGiaId', 'sapXep', 'chiNhanhId']) {
        const body = expectErrorResponse(
          await get(`/public/articles?${key}=1`),
          400,
          'DU_LIEU_KHONG_HOP_LE',
        );
        expect(body.loi).toEqual([
          { truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' },
        ]);
      }
    });

    it('ABP-11 (phụ): POST, PUT, PATCH, DELETE tới ba đường dẫn công khai ⇒ 404 KHONG_TIM_THAY (route công khai chỉ đọc)', async () => {
      const id = await publish('Có thật');
      for (const method of ['post', 'put', 'patch', 'delete'] as const)
        for (const path of [
          '/public/articles',
          `/public/articles/${id}`,
          '/public/article-tags',
        ])
          expectErrorResponse(
            await request(app.getHttpServer())[method](path),
            404,
            'KHONG_TIM_THAY',
          );
      expect((await af.articleRow(id))?.tieuDe).toBe('Có thật');
    });
  });

  describe('chi tiết (ABP-06, ABP-07)', () => {
    it('ABP-06: chi tiết đủ noiDung (nguyên văn, kể cả <script>), thẻ, thời điểm; KHÔNG tacGia, tacGiaId, email, tên tác giả, trangThai', async () => {
      const id = await publish('Sốt xuất huyết', {
        moTaNgan: 'Mô tả ngắn',
        noiDung: 'Dòng một\n## Tiêu đề phụ\n<script>alert(1)</script>',
        hashtags: ['sot', 'ho'],
        thoiDiemXuatBan: at(5),
      });
      const response = await get(`/public/articles/${id}`).expect(200);
      expect(response.body).toEqual({
        baiVietId: id,
        tieuDe: 'Sốt xuất huyết',
        moTaNgan: 'Mô tả ngắn',
        noiDung: 'Dòng một\n## Tiêu đề phụ\n<script>alert(1)</script>',
        anhDaiDien: null,
        thoiDiemXuatBan: at(5).toISOString(),
        hashtag: ['ho', 'sot'],
      });
      const text = JSON.stringify(response.body);
      for (const secret of [AUTHOR_EMAIL, AUTHOR_NAME, 'tacGia', 'trangThai'])
        expect(text).not.toContain(secret);
    });

    it('ABP-07: ẩn bài rồi gọi chi tiết ⇒ 404 ngay (danh sách cũng hết bài đó); xuất bản lại thì thấy lại', async () => {
      const id = await publish('Sẽ bị ẩn');
      await get(`/public/articles/${id}`).expect(200);
      await db.query(
        "UPDATE bai_viet SET trang_thai = 'LuuTruAn' WHERE bai_viet_id = ?",
        [id],
      );
      expectErrorResponse(
        await get(`/public/articles/${id}`),
        404,
        'KHONG_TIM_THAY',
      );
      expect((await get('/public/articles').expect(200)).body).toMatchObject({
        items: [],
        total: 0,
      });
      await db.query(
        "UPDATE bai_viet SET trang_thai = 'DaXuatBan' WHERE bai_viet_id = ?",
        [id],
      );
      await get(`/public/articles/${id}`).expect(200);
    });

    it('ABP-07: Cache-Control: no-cache ở 200, 400 và 404 của cả ba route công khai; route quản trị vẫn no-store', async () => {
      const id = await publish('Có header');
      const responses = [
        await get('/public/articles'),
        await get(`/public/articles/${id}`),
        await get('/public/article-tags'),
        await get('/public/articles/987654321'),
        await get('/public/articles/abc'),
        await get('/public/articles?pageSize=999'),
        await get('/public/articles?the=a%3Cb'),
      ];
      expect(responses.map((r) => r.status)).toEqual([
        200, 200, 200, 404, 404, 400, 400,
      ]);
      for (const response of responses)
        expect(response.headers['cache-control']).toBe(NO_CACHE);
      const admin = await get('/admin/articles', tokens.system).expect(200);
      expect(admin.headers['cache-control']).toBe('no-store');
    });

    it('ABP-07 (ghi hành vi đo thật, MH13): phản hồi 200 có ETag; gửi lại với If-None-Match ⇒ 304 (no-cache vẫn cho 304)', async () => {
      const id = await publish('Có ETag');
      const first = await get(`/public/articles/${id}`).expect(200);
      const etag = String(first.headers.etag);
      expect(etag).not.toBe('undefined');
      const second = await get(`/public/articles/${id}`).set(
        'If-None-Match',
        etag,
      );
      expect(second.status).toBe(304);
      expect(second.headers['cache-control']).toBe(NO_CACHE);
    });
  });

  describe('thẻ phổ biến (ABP-08)', () => {
    it('ABP-08: 25 thẻ ⇒ chỉ 20, soBai giảm dần rồi tên; chỉ đếm bài đã xuất bản; thẻ chỉ có bài nháp hay thẻ tắt không hiện', async () => {
      const names = Array.from(
        { length: 25 },
        (_, i) => `t${String(i + 1).padStart(2, '0')}`,
      );
      for (const [index, ten] of names.entries())
        await publish(`Bài ${ten}`, {
          hashtags: [ten],
          thoiDiemXuatBan: at(index),
        });
      // t24 và t25 có thêm một bài thứ hai ⇒ soBai 2, đứng đầu
      await publish('Bài hai thẻ', {
        hashtags: ['t24', 't25'],
        thoiDiemXuatBan: at(100),
      });
      // nháp và lưu trữ KHÔNG được cộng vào t01, t02; thẻ chỉ có bài nháp không hiện
      await draft('Nháp t01', ['t01', 'chi-nhap']);
      await archived('Lưu trữ t02', ['t02']);
      await af.hashtag('tat', false);
      await publish('Bài thẻ tắt', {
        hashtags: ['tat'],
        thoiDiemXuatBan: at(101),
      });
      const response = await get('/public/article-tags').expect(200);
      const items = (
        response.body as { items: { ten: string; soBai: number }[] }
      ).items;
      expect(items).toHaveLength(20);
      expect(items.slice(0, 2)).toEqual([
        { ten: 't24', soBai: 2 },
        { ten: 't25', soBai: 2 },
      ]);
      expect(items.slice(2).map((t) => t.ten)).toEqual(names.slice(0, 18));
      expect(items.slice(2).every((t) => t.soBai === 1)).toBe(true);
      const all = items.map((t) => t.ten);
      expect(all).not.toContain('chi-nhap');
      expect(all).not.toContain('tat');
    });

    it('ABP-08: không có bài nào ⇒ 200 với items rỗng', async () => {
      expect((await get('/public/article-tags').expect(200)).body).toEqual({
        items: [],
      });
    });
  });
});
