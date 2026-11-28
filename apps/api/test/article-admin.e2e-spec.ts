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
import type { LoaiTaiKhoan } from '../src/auth/entities/enums.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';

// article B1 — HTTP qua AppModule + auth + rbac + MySQL thật (PLAN article 7.2 đến 7.5): ABQ-01, ABQ-06, ABQ-07 (quyền), ABV-01 đến ABV-08, ABV-10 đến ABV-12 (vòng đời và biên tập),
// ABT-03, ABT-08 (thẻ), ABN-01 đến ABN-04 (nội dung và an toàn), cùng header `Cache-Control: no-store` (T10). Chạy ở CẢ TZ=UTC và TZ=Asia/Ho_Chi_Minh với đồng hồ giả.
const NOW = new Date('2026-11-05T09:30:45.678Z');
const NOW_SECOND = '2026-11-05T09:30:45.000Z';
const MINUTE = 60_000;
const NO_STORE = 'no-store';

describe('article B1 — API quản trị bài viết (HTTP)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: AdminFixtures;
  let af: ArticleFixtures;
  let sessions: SessionService;
  let systemId: string;
  const tokens = {} as Record<
    'system' | 'branch' | 'patient' | 'doctor' | 'reception',
    string
  >;

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
    // Chỉ giả `Date` (bộ hẹn giờ thật vẫn chạy nên kết nối MySQL không bị ảnh hưởng); phiên đăng nhập tạo SAU khi đặt giờ giả
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const branch = await fx.branch();
    systemId = (await fx.admin()).account.taiKhoanId;
    tokens.system = (await sessions.create(systemId)).accessToken;
    tokens.branch = (
      await sessions.create((await fx.admin(branch)).account.taiKhoanId)
    ).accessToken;
    for (const [key, role] of [
      ['patient', 'BenhNhan'],
      ['doctor', 'BacSi'],
      ['reception', 'LeTan'],
    ] as const satisfies readonly [keyof typeof tokens, LoaiTaiKhoan][]) {
      const account = await insertTaiKhoan(db, {
        loaiTaiKhoan: role,
        daXacMinhEmail: true,
      });
      tokens[key] = (await sessions.create(account.taiKhoanId)).accessToken;
    }
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  afterAll(async () => app?.close());

  type Method = 'get' | 'post' | 'patch';
  const send = (
    method: Method,
    path: string,
    token: string | null = tokens.system,
    body?: object,
  ) => {
    const req = request(app.getHttpServer())[method](path);
    if (token) req.auth(token, { type: 'bearer' });
    return body === undefined ? req : req.send(body);
  };
  const draft = (over: object = {}) => ({
    tieuDe: 'Sốt xuất huyết',
    moTaNgan: 'Cách phòng bệnh',
    noiDung: 'Nội dung bài viết',
    hashtag: ['ho'],
    trangThai: 'BanNhap',
    ...over,
  });
  const create = async (over: object = {}) =>
    (
      await send('post', '/admin/articles', tokens.system, draft(over)).expect(
        201,
      )
    ).body;
  const advance = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

  describe('quyền (ABQ-01, ABQ-06, ABQ-07)', () => {
    it('ABQ-01: mọi route × mọi vai, kể cả thân sai: khách 401; Bệnh nhân, Bác sĩ, Lễ tân, Quản trị viên Chi nhánh 403 (guard chạy trước pipe); Toàn hệ thống được', async () => {
      const id = (await create()).baiVietId;
      const forRole = (token: string | null) =>
        [
          // thân và truy vấn CỐ Ý sai: guard phải từ chối trước khi kiểm dữ liệu
          send('get', '/admin/articles?pageSize=999', token),
          send('get', `/admin/articles/${id}`, token),
          send('post', '/admin/articles', token, { sai: true }),
          send('patch', `/admin/articles/${id}`, token, { sai: true }),
          send('get', '/admin/hashtags?limit=999', token),
        ] as const;
      for (const response of await Promise.all(forRole(null)))
        expectErrorResponse(response, 401, 'CHUA_DANG_NHAP');
      for (const role of ['patient', 'doctor', 'reception', 'branch'] as const)
        for (const response of await Promise.all(forRole(tokens[role])))
          expectErrorResponse(response, 403, 'KHONG_DU_QUYEN');

      await send('get', '/admin/articles', tokens.system).expect(200);
      await send('get', `/admin/articles/${id}`).expect(200);
      await send('post', '/admin/articles', tokens.system, draft()).expect(201);
      await send('patch', `/admin/articles/${id}`, tokens.system, {
        tieuDe: 'Đổi',
      }).expect(200);
      await send('get', '/admin/hashtags').expect(200);
      expect((await af.rowCounts()).bai_viet).toBe(2);
    });

    it('T10: Cache-Control no-store ở 200, 201, 400, 401, 403 và 404 của route quản trị', async () => {
      const id = (await create()).baiVietId;
      const responses = [
        await send('get', '/admin/articles'),
        await send('get', `/admin/articles/${id}`),
        await send('post', '/admin/articles', tokens.system, draft()),
        await send('post', '/admin/articles', tokens.system, { sai: true }),
        await send('get', '/admin/articles', null),
        await send('get', '/admin/articles', tokens.branch),
        await send('get', '/admin/articles/987654321'),
        await send('get', '/admin/hashtags'),
      ];
      expect(responses.map((r) => r.status)).toEqual([
        200, 200, 201, 400, 401, 403, 404, 200,
      ]);
      for (const response of responses)
        expect(response.headers['cache-control']).toBe(NO_STORE);
    });

    it('ABQ-06: thân có tacGiaId, thoiDiemXuatBan, baiVietId, anhDaiDien, imageUploadId: 400 TRUONG_KHONG_DUOC_PHEP, không ghi gì', async () => {
      const id = (await create({ tieuDe: 'Có sẵn' })).baiVietId;
      const before = await af.articleRow(id);
      for (const key of [
        'tacGiaId',
        'thoiDiemXuatBan',
        'baiVietId',
        'anhDaiDien',
        'imageUploadId',
      ]) {
        const value = key === 'tacGiaId' ? systemId : 'x';
        const created = await send('post', '/admin/articles', tokens.system, {
          ...draft(),
          [key]: value,
        });
        expect(
          expectErrorResponse(created, 400, 'DU_LIEU_KHONG_HOP_LE').loi,
          key,
        ).toEqual([{ truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' }]);
        expectErrorResponse(
          await send('patch', `/admin/articles/${id}`, tokens.system, {
            tieuDe: 'Bị đổi',
            [key]: value,
          }),
          400,
          'DU_LIEU_KHONG_HOP_LE',
        );
      }
      expect((await af.rowCounts()).bai_viet).toBe(1);
      expect(await af.articleRow(id)).toEqual(before);
    });

    it('ABQ-07: Quản trị viên A tạo bài, B (cũng Toàn hệ thống) sửa: tác giả vẫn là A', async () => {
      const author = (await create({ tieuDe: 'Của A' })).tacGia;
      expect(author.taiKhoanId).toBe(systemId);
      const secondId = (await fx.admin()).account.taiKhoanId;
      const second = (await sessions.create(secondId)).accessToken;
      const edited = await send(
        'patch',
        `/admin/articles/${(await af.articleRowByTitle('Của A')).baiVietId}`,
        second,
        { tieuDe: 'B đã sửa' },
      ).expect(200);
      expect(edited.body.tieuDe).toBe('B đã sửa');
      expect(edited.body.tacGia.taiKhoanId).toBe(systemId);
      expect((await af.articleRow(edited.body.baiVietId))?.tacGiaId).toBe(
        systemId,
      );
    });
  });

  describe('vòng đời và biên tập (ABV)', () => {
    it('ABV-01: tạo BanNhap chỉ có tiêu đề (nội dung rỗng): 201, đúng khoá của hợp đồng, thoiDiemXuatBan null, tác giả từ token, không có khoá thừa', async () => {
      const body = await create({
        tieuDe: 'Chỉ có tiêu đề',
        moTaNgan: undefined,
        noiDung: '',
        hashtag: [],
      });
      expect(body).toEqual({
        baiVietId: expect.stringMatching(/^[1-9]\d*$/),
        tieuDe: 'Chỉ có tiêu đề',
        moTaNgan: null,
        noiDung: '',
        trangThai: 'BanNhap',
        thoiDiemXuatBan: null,
        thoiDiemTao: NOW_SECOND,
        capNhatLanCuoi: NOW_SECOND,
        tacGia: { taiKhoanId: systemId, hoTen: expect.any(String) },
        hashtag: [],
        anhDaiDien: null,
      });
    });

    it('ABV-02: tiêu đề rỗng, toàn khoảng trắng, 256 ký tự, kiểu sai: 400 TIEU_DE_KHONG_HOP_LE ở trường tieuDe và không ghi gì; 255 nhận; NFD lưu thành NFC', async () => {
      for (const bad of ['', '   \t ', 'a'.repeat(256), 5, null]) {
        const res = await send('post', '/admin/articles', tokens.system, {
          ...draft(),
          tieuDe: bad,
        });
        expect(
          expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE').loi,
          String(bad),
        ).toEqual([{ truong: 'tieuDe', ma: 'TIEU_DE_KHONG_HOP_LE' }]);
      }
      expect((await af.rowCounts()).bai_viet).toBe(0);
      const long = await create({ tieuDe: 'a'.repeat(255) });
      expect(long.tieuDe).toHaveLength(255);
      const nfd = 'Sốt  xuất huyết'.normalize('NFD');
      const stored = await create({ tieuDe: nfd });
      expect(stored.tieuDe).toBe('Sốt xuất huyết');
      expect((await af.articleRow(stored.baiVietId))?.tieuDe).toBe(
        'Sốt xuất huyết',
      );
    });

    it('ABV-03: tạo DaXuatBan không nội dung: 400 NOI_DUNG_BAT_BUOC_KHI_XUAT_BAN; có nội dung: 201 và thoiDiemXuatBan là đồng hồ giả cắt giây (giờ Việt Nam)', async () => {
      for (const noiDung of ['', '  \n ']) {
        const res = await send(
          'post',
          '/admin/articles',
          tokens.system,
          draft({ noiDung, trangThai: 'DaXuatBan' }),
        );
        expectErrorResponse(res, 400, 'NOI_DUNG_BAT_BUOC_KHI_XUAT_BAN');
      }
      expect((await af.rowCounts()).bai_viet).toBe(0);
      const body = await create({ trangThai: 'DaXuatBan' });
      expect(body.thoiDiemXuatBan).toBe(NOW_SECOND);
      expect((await af.articleRow(body.baiVietId))?.thoiDiemXuatBan).toBe(
        '2026-11-05 16:30:45',
      );
    });

    it('ABV-04: tạo thẳng LuuTruAn: 400 TRANG_THAI_KHONG_HOP_LE; trạng thái lạ cũng 400 (ở DTO)', async () => {
      expectErrorResponse(
        await send(
          'post',
          '/admin/articles',
          tokens.system,
          draft({ trangThai: 'LuuTruAn' }),
        ),
        400,
        'TRANG_THAI_KHONG_HOP_LE',
      );
      const unknown = await send(
        'post',
        '/admin/articles',
        tokens.system,
        draft({ trangThai: 'Foo' }),
      );
      expect(
        expectErrorResponse(unknown, 400, 'DU_LIEU_KHONG_HOP_LE').loi,
      ).toEqual([{ truong: 'trangThai', ma: 'TRANG_THAI_KHONG_HOP_LE' }]);
      expect((await af.rowCounts()).bai_viet).toBe(0);
    });

    it('ABV-05: BanNhap→DaXuatBan→LuuTruAn→DaXuatBan→BanNhap với đồng hồ giả nhảy giữa các bước: mỗi bước 200, thoiDiemXuatBan đặt ở lần đầu và GIỮ NGUYÊN, capNhatLanCuoi theo đồng hồ mới', async () => {
      const created = await create();
      const id = created.baiVietId;
      expect(created.thoiDiemXuatBan).toBeNull();
      const steps = ['DaXuatBan', 'LuuTruAn', 'DaXuatBan', 'BanNhap'] as const;
      let publishedAt: string | null = null;
      for (const [index, trangThai] of steps.entries()) {
        advance(MINUTE + 17_000 + index); // nhảy lẻ giây và mili giây: kết quả phải cắt giây
        const expectedNow = new Date(Date.now());
        expectedNow.setMilliseconds(0);
        const res = await send(
          'patch',
          `/admin/articles/${id}`,
          tokens.system,
          { trangThai },
        ).expect(200);
        expect(res.body.trangThai).toBe(trangThai);
        publishedAt ??= res.body.thoiDiemXuatBan;
        expect(res.body.thoiDiemXuatBan).toBe(publishedAt);
        expect(res.body.capNhatLanCuoi).toBe(expectedNow.toISOString());
      }
      // Lần đầu sang DaXuatBan là bước thứ nhất: NOW + 1 phút 17 giây
      expect(publishedAt).toBe(
        new Date(NOW.getTime() + MINUTE + 17_000)
          .toISOString()
          .replace(/\.\d{3}Z$/, '.000Z'),
      );
    });

    it('ABV-06: PATCH cùng trạng thái: 200 không đổi gì, capNhatLanCuoi giữ nguyên dù đồng hồ đã nhảy', async () => {
      const { baiVietId } = await create({ trangThai: 'DaXuatBan' });
      const before = await af.articleRow(baiVietId);
      advance(5 * MINUTE);
      for (const trangThai of ['DaXuatBan']) {
        const res = await send(
          'patch',
          `/admin/articles/${baiVietId}`,
          tokens.system,
          { trangThai },
        ).expect(200);
        expect(res.body.capNhatLanCuoi).toBe(NOW_SECOND);
        expect(res.body.trangThai).toBe(trangThai);
      }
      // Gửi lại đúng các giá trị đang có cũng không đổi gì
      await send('patch', `/admin/articles/${baiVietId}`, tokens.system, {
        tieuDe: 'Sốt xuất huyết',
        noiDung: 'Nội dung bài viết',
        hashtag: ['ho'],
      }).expect(200);
      expect(await af.articleRow(baiVietId)).toEqual(before);
    });

    it('ABV-07: sửa tiêu đề, mô tả, nội dung, thẻ của bài DaXuatBan: vẫn DaXuatBan, thoiDiemXuatBan không đổi, capNhatLanCuoi đổi; chỉ đổi thẻ cũng đổi; sửa nội dung thành rỗng bị chặn', async () => {
      const created = await create({ trangThai: 'DaXuatBan' });
      const id = created.baiVietId;
      advance(2 * MINUTE);
      const edited = await send(
        'patch',
        `/admin/articles/${id}`,
        tokens.system,
        {
          tieuDe: 'Tiêu đề mới',
          moTaNgan: 'Mô tả mới',
          noiDung: 'Nội dung mới',
          hashtag: ['ho', 'sốt'],
        },
      ).expect(200);
      expect(edited.body).toMatchObject({
        tieuDe: 'Tiêu đề mới',
        moTaNgan: 'Mô tả mới',
        noiDung: 'Nội dung mới',
        trangThai: 'DaXuatBan',
        hashtag: ['ho', 'sốt'],
        thoiDiemXuatBan: created.thoiDiemXuatBan,
        thoiDiemTao: created.thoiDiemTao,
      });
      const afterEdit = edited.body.capNhatLanCuoi;
      expect(afterEdit).toBe(
        new Date(NOW.getTime() + 2 * MINUTE)
          .toISOString()
          .replace(/\.\d{3}Z$/, '.000Z'),
      );

      advance(2 * MINUTE);
      const tagsOnly = await send(
        'patch',
        `/admin/articles/${id}`,
        tokens.system,
        { hashtag: ['sốt'] },
      ).expect(200);
      expect(tagsOnly.body.hashtag).toEqual(['sốt']);
      expect(tagsOnly.body.capNhatLanCuoi > afterEdit).toBe(true);

      expectErrorResponse(
        await send('patch', `/admin/articles/${id}`, tokens.system, {
          noiDung: '   ',
        }),
        400,
        'NOI_DUNG_BAT_BUOC_KHI_XUAT_BAN',
      );
      expect((await af.articleRow(id))?.noiDung).toBe('Nội dung mới');
    });

    it('ABV-08: ẩn bài đang DaXuatBan (LuuTruAn): phiếu đánh giá vẫn nằm trong bảng; số bài theo trạng thái cập nhật đúng', async () => {
      const { baiVietId } = await create({ trangThai: 'DaXuatBan' });
      const patient = await fx.patient();
      await af.rating(patient.account.taiKhoanId, baiVietId, 'Thich');
      const hidden = await send(
        'patch',
        `/admin/articles/${baiVietId}`,
        tokens.system,
        { trangThai: 'LuuTruAn' },
      ).expect(200);
      expect(hidden.body.trangThai).toBe('LuuTruAn');
      expect((await af.rowCounts()).benh_nhan_danh_gia_bai_viet).toBe(1);
      const list = await send('get', '/admin/articles').expect(200);
      expect(list.body.demTheoTrangThai).toEqual({
        BanNhap: 0,
        DaXuatBan: 0,
        LuuTruAn: 1,
      });
    });

    it('ABV-10: id sai dạng (abc, 0, -1, 20 chữ số) ở GET và PATCH: 400 DU_LIEU_KHONG_HOP_LE; id đúng dạng mà không có: 404 KHONG_TIM_THAY cùng thân', async () => {
      for (const id of ['abc', '0', '-1', '99999999999999999999']) {
        for (const res of [
          await send('get', `/admin/articles/${id}`),
          await send('patch', `/admin/articles/${id}`, tokens.system, {
            tieuDe: 'x',
          }),
        ])
          expect(
            expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE').loi,
            id,
          ).toEqual([{ truong: 'id', ma: 'MA_BAI_VIET_KHONG_HOP_LE' }]);
      }
      const getMissing = expectErrorResponse(
        await send('get', '/admin/articles/987654321'),
        404,
        'KHONG_TIM_THAY',
      );
      const patchMissing = expectErrorResponse(
        await send('patch', '/admin/articles/987654321', tokens.system, {
          tieuDe: 'x',
        }),
        404,
        'KHONG_TIM_THAY',
      );
      expect(patchMissing).toEqual(getMissing);
    });

    it('ABV-11: mô tả 500 nhận, 501 là MO_TA_QUA_DAI; PATCH mô tả rỗng thành null; thân PATCH rỗng là 400 DU_LIEU_KHONG_HOP_LE', async () => {
      const ok = await create({ moTaNgan: 'a'.repeat(500) });
      expect(ok.moTaNgan).toHaveLength(500);
      const long = await send(
        'post',
        '/admin/articles',
        tokens.system,
        draft({ moTaNgan: 'a'.repeat(501) }),
      );
      expect(
        expectErrorResponse(long, 400, 'DU_LIEU_KHONG_HOP_LE').loi,
      ).toEqual([{ truong: 'moTaNgan', ma: 'MO_TA_QUA_DAI' }]);
      const cleared = await send(
        'patch',
        `/admin/articles/${ok.baiVietId}`,
        tokens.system,
        { moTaNgan: '' },
      ).expect(200);
      expect(cleared.body.moTaNgan).toBeNull();
      const empty = expectErrorResponse(
        await send(
          'patch',
          `/admin/articles/${ok.baiVietId}`,
          tokens.system,
          {},
        ),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
      expect(empty.loi).toBeUndefined();
    });

    it('ABV-12: danh sách quản trị: lọc trangThai, q (không phân biệt dấu, % và _ khớp nguyên văn), the, phân trang; không trả noiDung; demTheoTrangThai đủ ba khoá và tính trên mọi bộ lọc TRỪ trangThai', async () => {
      const at = (day: number) => new Date(Date.UTC(2026, 10, day, 1, 0, 0));
      const seed = async (
        tieuDe: string,
        trangThai: 'BanNhap' | 'DaXuatBan' | 'LuuTruAn',
        day: number,
        tags: string[],
      ) => {
        const id = await af.article({
          tacGiaId: systemId,
          tieuDe,
          trangThai,
          noiDung: 'x',
          capNhatLanCuoi: at(day),
          thoiDiemXuatBan: trangThai === 'BanNhap' ? null : at(day),
        });
        for (const tag of tags) {
          const existing = (await af.allHashtags()).some((t) => t.ten === tag);
          await af.attach(
            id,
            existing ? await af.hashtagId(tag) : await af.hashtag(tag),
          );
        }
        return id;
      };
      await seed('Sốt xuất huyết', 'DaXuatBan', 1, ['ho', 'sốt']);
      await seed('Trẻ em bị ho', 'BanNhap', 2, ['ho']);
      await seed('Giảm giá 100% hôm nay', 'LuuTruAn', 3, []);
      await seed('Mã a_b đặc biệt', 'DaXuatBan', 4, ['sốt']);

      const list = async (query: string) =>
        (await send('get', `/admin/articles${query}`).expect(200)).body;
      const all = await list('');
      expect(all.items.map((i: { tieuDe: string }) => i.tieuDe)).toEqual([
        'Mã a_b đặc biệt',
        'Giảm giá 100% hôm nay',
        'Trẻ em bị ho',
        'Sốt xuất huyết',
      ]);
      expect(all).toMatchObject({
        total: 4,
        page: 1,
        pageSize: 20,
        demTheoTrangThai: { BanNhap: 1, DaXuatBan: 2, LuuTruAn: 1 },
      });
      expect(Object.keys(all.items[0]).sort()).toEqual(
        [
          'anhDaiDien',
          'baiVietId',
          'capNhatLanCuoi',
          'hashtag',
          'moTaNgan',
          'tacGia',
          'thoiDiemTao',
          'thoiDiemXuatBan',
          'tieuDe',
          'trangThai',
        ].sort(),
      );
      expect(all.items[3].hashtag).toEqual(['ho', 'sốt']);
      expect(all.items[0].tacGia).toEqual({
        taiKhoanId: systemId,
        hoTen: expect.any(String),
      });

      const published = await list('?trangThai=DaXuatBan');
      expect(published.total).toBe(2);
      expect(published.demTheoTrangThai).toEqual({
        BanNhap: 1,
        DaXuatBan: 2,
        LuuTruAn: 1,
      });

      const tre = await list('?q=tre%20em');
      expect(tre.items.map((i: { tieuDe: string }) => i.tieuDe)).toEqual([
        'Trẻ em bị ho',
      ]);
      expect(tre.demTheoTrangThai).toEqual({
        BanNhap: 1,
        DaXuatBan: 0,
        LuuTruAn: 0,
      });
      expect(
        (await list('?q=%25')).items.map((i: { tieuDe: string }) => i.tieuDe),
      ).toEqual(['Giảm giá 100% hôm nay']);
      expect(
        (await list('?q=a_b')).items.map((i: { tieuDe: string }) => i.tieuDe),
      ).toEqual(['Mã a_b đặc biệt']);
      expect((await list('?q=a_')).total).toBe(1);

      const byTag = await list('?the=%20%23Ho');
      expect(byTag.items.map((i: { tieuDe: string }) => i.tieuDe)).toEqual([
        'Trẻ em bị ho',
        'Sốt xuất huyết',
      ]);
      expect(byTag.demTheoTrangThai).toEqual({
        BanNhap: 1,
        DaXuatBan: 1,
        LuuTruAn: 0,
      });
      const both = await list(
        `?the=${encodeURIComponent('sốt')}&trangThai=DaXuatBan&q=${encodeURIComponent('giá')}`,
      );
      expect(both.total).toBe(0);
      expect(both.demTheoTrangThai).toEqual({
        BanNhap: 0,
        DaXuatBan: 0,
        LuuTruAn: 0,
      });

      const page2 = await list('?page=2&pageSize=3');
      expect(page2.items).toHaveLength(1);
      expect(page2).toMatchObject({ total: 4, page: 2, pageSize: 3 });
      expect((await list('?page=9')).items).toEqual([]);
      expectErrorResponse(
        await send('get', '/admin/articles?pageSize=101'),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
      expectErrorResponse(
        await send('get', '/admin/articles?khoaLa=1'),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
    });
  });

  describe('thẻ (ABT-03, ABT-08)', () => {
    it('ABT-03: 10 thẻ nhận, 11 thẻ khác nhau là 400 QUA_NHIEU_THE; Ho và ho gộp thành một thẻ', async () => {
      const ten = Array.from({ length: 10 }, (_, i) => `The${i}`);
      const ok = await create({ hashtag: ten });
      expect(ok.hashtag).toHaveLength(10);
      const eleven = await send(
        'post',
        '/admin/articles',
        tokens.system,
        draft({ hashtag: [...ten, 'The10'] }),
      );
      expect(
        expectErrorResponse(eleven, 400, 'DU_LIEU_KHONG_HOP_LE').loi,
      ).toEqual([{ truong: 'hashtag', ma: 'QUA_NHIEU_THE' }]);
      const merged = await create({
        tieuDe: 'Gộp',
        hashtag: ['Ho', 'ho', ' #HO '],
      });
      expect(merged.hashtag).toEqual(['ho']);
      const invalid = await send(
        'post',
        '/admin/articles',
        tokens.system,
        draft({ hashtag: ['ho', 'a/b'] }),
      );
      expect(
        expectErrorResponse(invalid, 400, 'DU_LIEU_KHONG_HOP_LE').loi,
      ).toEqual([{ truong: 'hashtag', ma: 'THE_KHONG_HOP_LE' }]);
    });

    it('ABT-08: sửa bài bỏ thẻ chỉ xoá dòng nối, thẻ còn trong bảng; gợi ý khớp tiền tố, không phân biệt hoa thường, chỉ thẻ hoạt động, tối đa limit', async () => {
      const { baiVietId } = await create({ hashtag: ['ho', 'sốt'] });
      const edited = await send(
        'patch',
        `/admin/articles/${baiVietId}`,
        tokens.system,
        { hashtag: ['sốt'] },
      ).expect(200);
      expect(edited.body.hashtag).toEqual(['sốt']);
      expect((await af.allHashtags()).map((t) => t.ten)).toEqual(['ho', 'sốt']);
      expect(await af.tagNamesOf(baiVietId)).toEqual(['sốt']);

      await af.hashtag('hô-hấp');
      await af.hashtag('ho-tắt', false);
      await af.hashtag('khác');
      const suggest = async (query: string) =>
        (
          await send('get', `/admin/hashtags${query}`).expect(200)
        ).body.items.map((i: { ten: string }) => i.ten);
      expect(await suggest('?q=H')).toEqual(['ho', 'hô-hấp']);
      expect(await suggest('?q=%23HO')).toEqual(['ho', 'hô-hấp']);
      expect(await suggest('?q=ho&limit=1')).toHaveLength(1);
      expect(await suggest('?q=zzz')).toEqual([]);
      expect(await suggest('?q=a%2Fb')).toEqual([]);
      expect(await suggest('')).toHaveLength(4);
      expectErrorResponse(
        await send('get', '/admin/hashtags?limit=11'),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
    });
  });

  describe('nội dung và an toàn (ABN-01 đến ABN-04)', () => {
    it('ABN-01: nội dung HTML và liên kết giả mạo được lưu và trả lại NGUYÊN VĂN (chữ thuần, không lọc)', async () => {
      const html =
        '<script>alert(1)</script>\n<img src=x onerror=alert(1)>\njavascript:alert(1)\n&lt;b&gt;';
      const { baiVietId } = await create({ noiDung: html });
      const read = await send('get', `/admin/articles/${baiVietId}`).expect(
        200,
      );
      expect(read.body.noiDung).toBe(html);
      expect((await af.articleRow(baiVietId))?.noiDung).toBe(html);
    });

    it('ABN-02: ký tự điều khiển (NUL, chuông) bị 400 NOI_DUNG_KHONG_HOP_LE; `\\r\\n` thành `\\n`; tab nhận', async () => {
      for (const bad of ['a\x00b', 'a\x07b', 'a\rb']) {
        const res = await send(
          'post',
          '/admin/articles',
          tokens.system,
          draft({ noiDung: bad }),
        );
        expect(
          expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE').loi,
          JSON.stringify(bad),
        ).toEqual([{ truong: 'noiDung', ma: 'NOI_DUNG_KHONG_HOP_LE' }]);
      }
      const { baiVietId } = await create({
        noiDung: 'dòng một\r\ndòng hai\tcó tab',
      });
      expect((await af.articleRow(baiVietId))?.noiDung).toBe(
        'dòng một\ndòng hai\tcó tab',
      );
    });

    it('ABN-03: 20.000 ký tự nhận, 20.001 là NOI_DUNG_QUA_DAI; 16.000 emoji (64.000 byte) bị chặn; 20.000 chữ tiếng Việt (60.000 byte) nhận', async () => {
      await create({ noiDung: 'a'.repeat(20_000) });
      await create({ noiDung: 'ệ'.repeat(20_000) });
      for (const bad of ['a'.repeat(20_001), '😀'.repeat(16_000)]) {
        const res = await send(
          'post',
          '/admin/articles',
          tokens.system,
          draft({ noiDung: bad }),
        );
        expect(
          expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE').loi,
        ).toEqual([{ truong: 'noiDung', ma: 'NOI_DUNG_QUA_DAI' }]);
      }
      expect((await af.rowCounts()).bai_viet).toBe(2);
    });

    it('ABN-04: thân JSON vượt giới hạn mặc định của máy chủ (100 kB): mã lỗi ổn định 413 DU_LIEU_QUA_LON, không 500 (hành vi đo được); nội dung hợp lệ lớn nhất nhiều ký tự thoát vẫn dưới giới hạn', async () => {
      const huge = await send(
        'post',
        '/admin/articles',
        tokens.system,
        draft({ noiDung: 'a'.repeat(150_000) }),
      );
      expectErrorResponse(huge, 413, 'DU_LIEU_QUA_LON');
      expect((await af.rowCounts()).bai_viet).toBe(0);
      // 20.000 ký tự gồm dấu nháy kép và xuống dòng (mỗi ký tự thành hai byte JSON) vẫn nhận
      const escaped = '"\n'.repeat(10_000);
      const ok = await create({ noiDung: escaped });
      expect(ok.noiDung).toBe(escaped);
    });
  });

  it('B4-I6 kiểu chatbot: TZ có hiệu lực thật (UTC thì lệch 0 phút, Asia/Ho_Chi_Minh thì −420 phút); không đặt TZ thì không khẳng định gì', () => {
    const want = (
      { UTC: 0, 'Asia/Ho_Chi_Minh': -420 } as Record<string, number>
    )[process.env.TZ ?? ''];
    if (want !== undefined) expect(new Date().getTimezoneOffset()).toBe(want);
  });
});
