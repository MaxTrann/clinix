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

// article B3 — HTTP qua AppModule + auth + rbac + MySQL thật cho API đánh giá bài viết (PLAN article 7.9): ABR-01 (quyền theo vai, mã Bệnh nhân từ token), ABR-02 đến ABR-05 (đặt, đổi, thu hồi),
// ABR-06 (404 cùng thân, không ghi; 400 loại lạ), ABR-09 (số đếm ở chi tiết công khai, ẩn rồi xuất bản lại qua API quản trị), ABR-10 (phiếu của chính mình), cùng header `Cache-Control: no-store` (T10).
// Chỉ chạy ở TZ=Asia/Ho_Chi_Minh (`validateEnv` của AppModule); ca cổng và ca đua trên MySQL thật (ABR-07, ABR-08) nằm ở `src/article/rating/article-rating.int-spec.ts`.
const NO_STORE = 'no-store';
const NO_CACHE = 'no-cache';
const NOT_FOUND = 'KHONG_TIM_THAY';
const INVALID_TYPE = {
  truong: 'loai',
  ma: 'LOAI_DANH_GIA_KHONG_HOP_LE',
};

describe('article B3 — API đánh giá bài viết (HTTP)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: AdminFixtures;
  let af: ArticleFixtures;
  let sessions: SessionService;
  let authorId: string;
  const tokens = {} as Record<
    'system' | 'branch' | 'patient' | 'other' | 'doctor' | 'reception',
    string
  >;
  const patientIds = {} as Record<'patient' | 'other', string>;

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
    const branch = await fx.branch();
    authorId = (await fx.admin()).account.taiKhoanId;
    tokens.system = (await sessions.create(authorId)).accessToken;
    tokens.branch = (
      await sessions.create((await fx.admin(branch)).account.taiKhoanId)
    ).accessToken;
    // Bệnh nhân CÓ dòng `benh_nhan` (khoá ngoại của phiếu); `insertTaiKhoan` thuần không đủ
    for (const key of ['patient', 'other'] as const) {
      patientIds[key] = (await fx.patient()).account.taiKhoanId;
      tokens[key] = (await sessions.create(patientIds[key])).accessToken;
    }
    for (const [key, role] of [
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
  afterAll(async () => app?.close());

  type Method = 'get' | 'put' | 'delete' | 'patch';
  const send = (
    method: Method,
    path: string,
    token: string | null = tokens.patient,
    body?: object,
  ) => {
    const req = request(app.getHttpServer())[method](path);
    if (token) req.auth(token, { type: 'bearer' });
    return body === undefined ? req : req.send(body);
  };
  const ratingUrl = (id: string): string => `/patient/articles/${id}/rating`;
  const publish = (tieuDe = 'Sốt xuất huyết') =>
    af.published({ tacGiaId: authorId, tieuDe });
  const put = (id: string, loai: string, token = tokens.patient) =>
    send('put', ratingUrl(id), token, { loai });
  const detailOf = (id: string) => send('get', `/public/articles/${id}`, null);
  const setStatus = (id: string, trangThai: string) =>
    send('patch', `/admin/articles/${id}`, tokens.system, { trangThai });

  describe('quyền (ABR-01)', () => {
    it('ABR-01: ba route × mọi vai, kể cả id và thân sai: khách 401; Bác sĩ, Lễ tân, Quản trị viên Toàn hệ thống và Chi nhánh 403 (guard chạy trước pipe); Bệnh nhân 200; header no-store ở mọi mã', async () => {
      const id = await publish();
      const forRole = (token: string | null, atId = id) =>
        [
          send('get', ratingUrl(atId), token),
          send('put', ratingUrl(atId), token, { loai: 'Thich' }),
          send('delete', ratingUrl(atId), token),
        ] as const;
      for (const response of await Promise.all(forRole(null))) {
        expectErrorResponse(response, 401, 'CHUA_DANG_NHAP');
        expect(response.headers['cache-control']).toBe(NO_STORE);
      }
      for (const role of ['doctor', 'reception', 'system', 'branch'] as const) {
        for (const response of await Promise.all(forRole(tokens[role]))) {
          expectErrorResponse(response, 403, 'KHONG_DU_QUYEN');
          expect(response.headers['cache-control']).toBe(NO_STORE);
        }
        // id và thân CỐ Ý sai: guard từ chối TRƯỚC khi kiểm dữ liệu nên vẫn 403, không phải 404 hay 400
        for (const response of await Promise.all([
          send('get', ratingUrl('abc'), tokens[role]),
          send('put', ratingUrl('abc'), tokens[role], { sai: true }),
          send('delete', ratingUrl('abc'), tokens[role]),
        ]))
          expectErrorResponse(response, 403, 'KHONG_DU_QUYEN');
      }
      // Các vai khác không ghi được gì
      expect((await af.rowCounts()).benh_nhan_danh_gia_bai_viet).toBe(0);
      const [read, write, withdraw] = await Promise.all(
        forRole(tokens.patient),
      );
      expect(read.status).toBe(200);
      expect(write.status).toBe(200);
      expect(withdraw.status).toBe(200);
      for (const response of [read, write, withdraw])
        expect(response.headers['cache-control']).toBe(NO_STORE);
    });

    it('ABR-01: mã Bệnh nhân CHỈ lấy từ token: thân có benhNhanId ⇒ 400 TRUONG_KHONG_DUOC_PHEP và không phiếu nào ghi; query benhNhanId bị bỏ qua, GET vẫn trả phiếu của CHÍNH người gọi', async () => {
      const id = await publish();
      await put(id, 'Thich', tokens.other).expect(200);
      const response = await send('put', ratingUrl(id), tokens.patient, {
        loai: 'Thich',
        benhNhanId: patientIds.other,
      });
      const body = expectErrorResponse(response, 400, 'DU_LIEU_KHONG_HOP_LE');
      expect(body.loi).toEqual([
        { truong: 'benhNhanId', ma: 'TRUONG_KHONG_DUOC_PHEP' },
      ]);
      expect(await af.ratingOf(patientIds.patient, id)).toBeNull();
      const spoofed = await send(
        'get',
        `${ratingUrl(id)}?benhNhanId=${patientIds.other}`,
        tokens.patient,
      ).expect(200);
      expect(spoofed.body).toEqual({ loai: null });
    });
  });

  describe('đặt, đổi, thu hồi (ABR-02 đến ABR-05)', () => {
    it('ABR-02: PUT Thích khi chưa có phiếu ⇒ 200 { loai, luotThich: 1, luotKhongThich: 0 }, đúng một dòng', async () => {
      const id = await publish();
      const response = await put(id, 'Thich').expect(200);
      expect(response.body).toEqual({
        loai: 'Thich',
        luotThich: 1,
        luotKhongThich: 0,
      });
      expect(response.headers['cache-control']).toBe(NO_STORE);
      expect(await af.ratingRows(id)).toEqual([
        { benhNhanId: patientIds.patient, loai: 'Thich' },
      ]);
    });

    it('ABR-03: PUT Không thích sau Thích ⇒ Thích −1, Không thích +1, MỘT dòng; phiếu của người khác không đổi', async () => {
      const id = await publish();
      await put(id, 'Thich', tokens.other).expect(200);
      await put(id, 'Thich').expect(200);
      const response = await put(id, 'KhongThich').expect(200);
      expect(response.body).toEqual({
        loai: 'KhongThich',
        luotThich: 1,
        luotKhongThich: 1,
      });
      expect(await af.ratingRows(id)).toHaveLength(2);
      expect(await af.ratingOf(patientIds.other, id)).toBe('Thich');
    });

    it('ABR-04: PUT cùng loại lần nữa ⇒ 200, không đổi, một dòng (không cộng dồn)', async () => {
      const id = await publish();
      const first = await put(id, 'Thich').expect(200);
      const again = await put(id, 'Thich').expect(200);
      expect(again.body).toEqual(first.body);
      expect(again.body).toEqual({
        loai: 'Thich',
        luotThich: 1,
        luotKhongThich: 0,
      });
      expect(await af.ratingRows(id)).toHaveLength(1);
    });

    it('ABR-05: DELETE ⇒ dòng bị xoá, số đếm −1, loai null; DELETE lần hai ⇒ 200 không đổi; người khác còn nguyên; chưa từng đánh giá ⇒ vẫn 200', async () => {
      const id = await publish();
      await put(id, 'Thich', tokens.other).expect(200);
      await put(id, 'Thich').expect(200);
      const removed = await send('delete', ratingUrl(id)).expect(200);
      expect(removed.body).toEqual({
        loai: null,
        luotThich: 1,
        luotKhongThich: 0,
      });
      expect(removed.headers['cache-control']).toBe(NO_STORE);
      expect(await af.ratingOf(patientIds.patient, id)).toBeNull();
      const second = await send('delete', ratingUrl(id)).expect(200);
      expect(second.body).toEqual(removed.body);
      expect(await af.ratingOf(patientIds.other, id)).toBe('Thich');
      // Người chưa từng đánh giá cũng nhận 200 và không xoá phiếu của ai
      const stranger = await send('delete', ratingUrl(id), tokens.other);
      expect(stranger.status).toBe(200);
      expect(stranger.body).toEqual({
        loai: null,
        luotThich: 0,
        luotKhongThich: 0,
      });
    });
  });

  describe('404 và 400 (ABR-06)', () => {
    it('ABR-06: BanNhap, LuuTruAn, id không có, abc, 0, -1, 20 chữ số, id kèm slug, vượt BIGINT ⇒ CÙNG một 404 KHONG_TIM_THAY ở GET, PUT, DELETE, no-store, và KHÔNG ghi gì', async () => {
      const draft = await af.published({
        tacGiaId: authorId,
        tieuDe: 'Bản nháp',
        trangThai: 'BanNhap',
        thoiDiemXuatBan: null,
      });
      const archived = await af.published({
        tacGiaId: authorId,
        tieuDe: 'Bản lưu trữ',
        trangThai: 'LuuTruAn',
      });
      const ids = [
        draft,
        archived,
        '987654321',
        'abc',
        '0',
        '-1',
        '12345678901234567890',
        `${draft}-ban-nhap`,
        '9999999999999999999',
      ];
      const before = await af.rowCounts();
      const bodies: unknown[] = [];
      for (const id of ids)
        for (const response of await Promise.all([
          send('get', ratingUrl(id)),
          put(id, 'Thich'),
          send('delete', ratingUrl(id)),
        ])) {
          const body = expectErrorResponse(response, 404, NOT_FOUND);
          expect(response.headers['cache-control']).toBe(NO_STORE);
          bodies.push(body);
        }
      expect(bodies).toHaveLength(ids.length * 3);
      for (const body of bodies) expect(body).toEqual(bodies[0]);
      expect(await af.rowCounts()).toEqual(before);
    });

    it('ABR-06: loai lạ, vắng, null, số, sai hoa thường ⇒ 400 DU_LIEU_KHONG_HOP_LE với loi[{ loai, LOAI_DANH_GIA_KHONG_HOP_LE }], không ghi; thứ tự guard → pipe → service: loai lạ trên bài không có vẫn 400', async () => {
      const id = await publish();
      for (const body of [
        { loai: 'Yeu' },
        {},
        { loai: null },
        { loai: 1 },
        { loai: 'thich' },
        { loai: '' },
        { loai: ['Thich'] },
      ]) {
        const response = await send('put', ratingUrl(id), tokens.patient, body);
        const error = expectErrorResponse(
          response,
          400,
          'DU_LIEU_KHONG_HOP_LE',
        );
        expect(error.loi, JSON.stringify(body)).toEqual([INVALID_TYPE]);
        expect(response.headers['cache-control']).toBe(NO_STORE);
      }
      const missing = await send(
        'put',
        ratingUrl('987654321'),
        tokens.patient,
        {
          loai: 'Yeu',
        },
      );
      expect(
        expectErrorResponse(missing, 400, 'DU_LIEU_KHONG_HOP_LE').loi,
      ).toEqual([INVALID_TYPE]);
      expect(await af.ratingRows(id)).toEqual([]);
    });

    it('ABR-06 (A2 3c): bài đã có phiếu rồi bị ẩn qua API quản trị ⇒ PUT, DELETE, GET đều 404 và phiếu GIỮ NGUYÊN; xuất bản lại thì dùng lại được', async () => {
      const id = await publish();
      await put(id, 'Thich').expect(200);
      await setStatus(id, 'LuuTruAn').expect(200);
      for (const response of await Promise.all([
        put(id, 'KhongThich'),
        send('delete', ratingUrl(id)),
        send('get', ratingUrl(id)),
      ]))
        expectErrorResponse(response, 404, NOT_FOUND);
      expect(await af.ratingOf(patientIds.patient, id)).toBe('Thich');
      await setStatus(id, 'DaXuatBan').expect(200);
      expect((await send('get', ratingUrl(id)).expect(200)).body).toEqual({
        loai: 'Thich',
      });
    });
  });

  describe('số đếm ở chi tiết công khai (ABR-09)', () => {
    it('ABR-09: khách xem chi tiết thấy luotThich, luotKhongThich đúng (số nguyên) sau nhiều Bệnh nhân đánh giá; bài chưa ai bấm ⇒ 0 và 0; vẫn no-cache, không lộ ai đã bấm', async () => {
      const id = await publish();
      const empty = await publish('Chưa ai bấm');
      await put(id, 'Thich', tokens.patient).expect(200);
      await put(id, 'KhongThich', tokens.other).expect(200);
      const response = await detailOf(id).expect(200);
      expect(response.body).toMatchObject({
        baiVietId: id,
        luotThich: 1,
        luotKhongThich: 1,
      });
      expect(response.headers['cache-control']).toBe(NO_CACHE);
      // Chỉ có tổng, không có danh sách người bấm: không khoá nào nhắc tới Bệnh nhân hay phiếu
      expect(
        Object.keys(response.body as object).filter((key) =>
          /benh|nguoi|phieu|tai_?khoan/i.test(key),
        ),
      ).toEqual([]);
      expect((await detailOf(empty).expect(200)).body).toMatchObject({
        luotThich: 0,
        luotKhongThich: 0,
      });
      // Đổi và thu hồi hiện ngay ở chi tiết công khai
      await put(id, 'KhongThich', tokens.patient).expect(200);
      await send('delete', ratingUrl(id), tokens.other).expect(200);
      expect((await detailOf(id).expect(200)).body).toMatchObject({
        luotThich: 0,
        luotKhongThich: 1,
      });
    });

    it('ABR-09 (2.4.55 A2 3c): ẩn bài rồi xuất bản lại qua API quản trị ⇒ chi tiết 404 khi ẩn, số CŨ hiện lại nguyên vẹn; phiếu không bị xoá', async () => {
      const id = await publish();
      await put(id, 'Thich', tokens.patient).expect(200);
      await put(id, 'KhongThich', tokens.other).expect(200);
      const before = (await detailOf(id).expect(200)).body;
      await setStatus(id, 'LuuTruAn').expect(200);
      expectErrorResponse(await detailOf(id), 404, NOT_FOUND);
      expect(await af.ratingRows(id)).toHaveLength(2);
      await setStatus(id, 'DaXuatBan').expect(200);
      const after = (await detailOf(id).expect(200)).body;
      expect(after).toMatchObject({ luotThich: 1, luotKhongThich: 1 });
      expect(after).toEqual(before);
    });

    it('ABR-09: khoá cũ của chi tiết không đổi (ABP-06 sau khi cộng): có hai khoá mới, không tác giả, email, trạng thái; danh sách công khai KHÔNG có số đếm (MH17)', async () => {
      const id = await publish();
      await put(id, 'Thich').expect(200);
      const detail = (await detailOf(id).expect(200)).body as object;
      expect(Object.keys(detail).sort()).toEqual(
        [
          'anhDaiDien',
          'baiVietId',
          'hashtag',
          'luotKhongThich',
          'luotThich',
          'moTaNgan',
          'noiDung',
          'thoiDiemXuatBan',
          'tieuDe',
        ].sort(),
      );
      const list = await send('get', '/public/articles', null).expect(200);
      const item = (list.body as { items: object[] }).items[0] as object;
      expect(Object.keys(item)).not.toContain('luotThich');
      expect(Object.keys(item)).not.toContain('luotKhongThich');
    });
  });

  describe('phiếu của chính mình (ABR-10)', () => {
    it('ABR-10: GET chưa đánh giá ⇒ { loai: null } (đúng một khoá); sau PUT ⇒ loại đó; người khác KHÔNG thấy phiếu của mình; no-store', async () => {
      const id = await publish();
      const none = await send('get', ratingUrl(id)).expect(200);
      expect(none.body).toEqual({ loai: null });
      expect(none.headers['cache-control']).toBe(NO_STORE);
      await put(id, 'KhongThich').expect(200);
      const mine = await send('get', ratingUrl(id)).expect(200);
      expect(mine.body).toEqual({ loai: 'KhongThich' });
      expect(mine.headers['cache-control']).toBe(NO_STORE);
      const theirs = await send('get', ratingUrl(id), tokens.other).expect(200);
      expect(theirs.body).toEqual({ loai: null });
      expect(JSON.stringify(theirs.body)).not.toContain(patientIds.patient);
      // Thu hồi rồi đọc lại
      await send('delete', ratingUrl(id)).expect(200);
      expect((await send('get', ratingUrl(id)).expect(200)).body).toEqual({
        loai: null,
      });
    });
  });
});
