import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AdminFixtures } from '../src/admin/testing/admin-fixtures.js';
import { BookingFixtures } from '../src/appointments/testing/booking-fixtures.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { resetTables } from '../src/database/testing/test-database.js';

// Admin B9, B10, B21 — YCB-09, YCB-14, YCB-32 [đề xuất mã]: yêu cầu thay đổi chi nhánh qua HTTP (AppModule, Auth, C1, MySQL thật): vai trò, phạm vi, dữ liệu vào sai.
describe('B9 yêu cầu thay đổi chi nhánh — HTTP', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let sessions: SessionService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    sessions = app.get(SessionService);
  });
  beforeEach(async () => resetTables(db));
  afterAll(async () => app?.close());

  const tokenOf = async (id: string) => (await sessions.create(id)).accessToken;
  const call = (
    method: 'get' | 'post',
    path: string,
    token?: string,
    body?: object,
  ) => {
    const req = request(app.getHttpServer())[method](
      `/admin/branch-change-requests${path}`,
    );
    if (body) void req.send(body);
    return token ? req.auth(token, { type: 'bearer' }) : req;
  };

  async function world() {
    const fx = new AdminFixtures(db);
    const mine = await fx.branch({ ten: 'Chi nhánh A' });
    const other = await fx.branch({ ten: 'Chi nhánh B' });
    const doctor = await fx.doctor(mine);
    const branchAdmin = await fx.admin(mine);
    const insert = async (branchId: string) =>
      String(
        (
          (await db.query(
            `INSERT INTO yeu_cau_thay_doi_chi_nhanh (chi_nhanh_id, nguoi_de_xuat_id, noi_dung_truoc, noi_dung_sau)
             VALUES (?, ?, JSON_OBJECT('dich_vu_kham_ids', JSON_ARRAY()), JSON_OBJECT('dich_vu_kham_ids', JSON_ARRAY()))`,
            [branchId, branchAdmin.account.taiKhoanId],
          )) as { insertId: number }
        ).insertId,
      );
    return {
      mineRequest: await insert(mine.chiNhanhId),
      otherRequest: await insert(other.chiNhanhId),
      system: await tokenOf((await fx.admin()).account.taiKhoanId),
      branchAdmin: await tokenOf(branchAdmin.account.taiKhoanId),
      doctor: await tokenOf(doctor.account.taiKhoanId),
      receptionist: await tokenOf(
        (await fx.receptionist(mine)).account.taiKhoanId,
      ),
      patient: await tokenOf((await fx.patient()).account.taiKhoanId),
    };
  }

  it('YCB-09 chưa đăng nhập ⇒ 401; Bệnh nhân, Bác sĩ, Lễ tân ⇒ 403 ở cả xem và từ chối', async () => {
    const w = await world();
    await call('get', '').expect(401);
    await call('post', `/${w.mineRequest}/reject`, undefined, {
      lyDo: 'x',
    }).expect(401);
    for (const token of [w.patient, w.doctor, w.receptionist]) {
      await call('get', '', token).expect(403);
      await call('get', `/${w.mineRequest}`, token).expect(403);
      await call('post', `/${w.mineRequest}/reject`, token, {
        lyDo: 'x',
      }).expect(403);
    }
  });

  it('YCB-09 Chi nhánh: xem được của mình, của chi nhánh khác ⇒ 404; từ chối ⇒ 403 (CN-56)', async () => {
    const w = await world();
    const list = await call('get', '', w.branchAdmin).expect(200);
    expect(list.body).toMatchObject({
      total: 1,
      items: [{ yeuCauThayDoiChiNhanhId: w.mineRequest }],
    });
    await call('get', `/${w.mineRequest}`, w.branchAdmin).expect(200);
    const hidden = await call(
      'get',
      `/${w.otherRequest}`,
      w.branchAdmin,
    ).expect(404);
    expect(hidden.body).toMatchObject({ maLoi: 'KHONG_TIM_THAY' });
    const denied = await call(
      'post',
      `/${w.mineRequest}/reject`,
      w.branchAdmin,
      { lyDo: 'x' },
    ).expect(403);
    expect(denied.body).toMatchObject({ maLoi: 'KHONG_DU_QUYEN' });
  });

  it('YCB-09 Toàn hệ thống từ chối ⇒ 200 kèm chi tiết; lần hai ⇒ 409; dữ liệu vào sai ⇒ 400', async () => {
    const w = await world();
    const ok = await call('post', `/${w.mineRequest}/reject`, w.system, {
      lyDo: '  Không hợp lý  ',
    }).expect(200);
    expect(ok.body).toMatchObject({
      trangThai: 'TuChoi',
      lyDoTuChoi: 'Không hợp lý',
    });
    const again = await call('post', `/${w.mineRequest}/reject`, w.system, {
      lyDo: 'x',
    }).expect(409);
    expect(again.body).toMatchObject({ maLoi: 'YEU_CAU_KHONG_CON_CHO_DUYET' });
    await call('post', `/${w.otherRequest}/reject`, w.system, {}).expect(400);
    await call('post', `/${w.otherRequest}/reject`, w.system, {
      lyDo: 'x',
      nguoiDuyetId: '1',
    }).expect(400);
    await call('post', '/abc/reject', w.system, { lyDo: 'x' }).expect(400);
    await call('get', '/abc', w.system).expect(400);
    await call('get', '?trangThai=QuaHan', w.system).expect(400);
  });

  // Admin B10 — YCB-14 [đề xuất mã]: duyệt qua HTTP. Cấu hình báo trước 3 ngày; đồng hồ thật nên mốc dùng năm xa (không phụ thuộc ngày chạy).
  describe('B10 duyệt', () => {
    const FAR = '2099-01-01 08:00:00';
    const withConfig = async () =>
      new BookingFixtures(db).systemConfig({ soNgayBaoTruocDoiGioLam: 3 });

    it('YCB-14 chưa đăng nhập ⇒ 401; Bệnh nhân, Bác sĩ, Lễ tân, Chi nhánh ⇒ 403 (CN-56)', async () => {
      const w = await world();
      await withConfig();
      await call('post', `/${w.mineRequest}/approve`, undefined, {
        hieuLucTu: FAR,
      }).expect(401);
      for (const token of [w.patient, w.doctor, w.receptionist])
        await call('post', `/${w.mineRequest}/approve`, token, {
          hieuLucTu: FAR,
        }).expect(403);
      const denied = await call(
        'post',
        `/${w.mineRequest}/approve`,
        w.branchAdmin,
        { hieuLucTu: FAR },
      ).expect(403);
      expect(denied.body).toMatchObject({ maLoi: 'KHONG_DU_QUYEN' });
    });

    it('YCB-14 Toàn hệ thống duyệt ⇒ 200 kèm chi tiết; lần hai ⇒ 409; mốc quá sớm ⇒ 400; dữ liệu vào sai ⇒ 400', async () => {
      const w = await world();
      await withConfig();
      const early = await call('post', `/${w.otherRequest}/approve`, w.system, {
        hieuLucTu: '2000-01-01 00:00:00',
      }).expect(400);
      expect(early.body).toMatchObject({
        maLoi: 'HIEU_LUC_QUA_SOM',
        chiTiet: { mocSomNhat: expect.any(String) },
      });
      const ok = await call('post', `/${w.mineRequest}/approve`, w.system, {
        hieuLucTu: FAR,
      }).expect(200);
      expect(ok.body).toMatchObject({
        trangThai: 'DaDuyet',
        hieuLucTu: FAR,
        apDungLuc: null,
        soNgayBaoTruoc: 3,
      });
      const again = await call('post', `/${w.mineRequest}/approve`, w.system, {
        hieuLucTu: FAR,
      }).expect(409);
      expect(again.body).toMatchObject({
        maLoi: 'YEU_CAU_KHONG_CON_CHO_DUYET',
      });
      await call('post', `/${w.otherRequest}/approve`, w.system, {}).expect(
        400,
      );
      await call('post', `/${w.otherRequest}/approve`, w.system, {
        hieuLucTu: '2099-01-01T08:00:00+07:00',
      }).expect(400);
      await call('post', `/${w.otherRequest}/approve`, w.system, {
        hieuLucTu: FAR,
        nguoiDuyetId: '1',
      }).expect(400);
      await call('post', '/abc/approve', w.system, { hieuLucTu: FAR }).expect(
        400,
      );
    });

    it('YCB-14 chưa có cấu hình ⇒ 409 HE_THONG_CHUA_CAU_HINH (CN-55)', async () => {
      const w = await world();
      const res = await call('post', `/${w.mineRequest}/approve`, w.system, {
        hieuLucTu: FAR,
      }).expect(409);
      expect(res.body).toMatchObject({ maLoi: 'HE_THONG_CHUA_CAU_HINH' });
    });
  });

  // Admin B21 — YCB-32 [đề xuất mã]: rút và hủy qua HTTP
  describe('B21 rút và hủy', () => {
    it('YCB-32 chưa đăng nhập ⇒ 401; Bệnh nhân, Bác sĩ, Lễ tân ⇒ 403 ở cả rút và hủy', async () => {
      const w = await world();
      await call('post', `/${w.mineRequest}/withdraw`).expect(401);
      await call('post', `/${w.mineRequest}/cancel`, undefined, {
        lyDo: 'x',
      }).expect(401);
      for (const token of [w.patient, w.doctor, w.receptionist]) {
        await call('post', `/${w.mineRequest}/withdraw`, token).expect(403);
        await call('post', `/${w.mineRequest}/cancel`, token, {
          lyDo: 'x',
        }).expect(403);
      }
    });

    it('YCB-32 người gửi (Chi nhánh) rút ⇒ 200 DaRut, lần hai ⇒ 409; yêu cầu chi nhánh khác ⇒ 404; Toàn hệ thống không phải người gửi ⇒ 403', async () => {
      const w = await world();
      await call('post', `/${w.otherRequest}/withdraw`, w.branchAdmin).expect(
        404,
      );
      const denied = await call(
        'post',
        `/${w.mineRequest}/withdraw`,
        w.system,
      ).expect(403);
      expect(denied.body).toMatchObject({ maLoi: 'KHONG_DU_QUYEN' });
      const ok = await call(
        'post',
        `/${w.mineRequest}/withdraw`,
        w.branchAdmin,
      ).expect(200);
      expect(ok.body).toMatchObject({ trangThai: 'DaRut' });
      const again = await call(
        'post',
        `/${w.mineRequest}/withdraw`,
        w.branchAdmin,
      ).expect(409);
      expect(again.body).toMatchObject({ maLoi: 'YEU_CAU_KHONG_THE_RUT_HUY' });
    });

    it('YCB-32 hủy: Chi nhánh ⇒ 403 (CN-98); Toàn hệ thống hủy yêu cầu đã duyệt ⇒ 200 DaHuy; ChoDuyet ⇒ 409; thiếu lý do, trường lạ ⇒ 400', async () => {
      const w = await world();
      await new BookingFixtures(db).systemConfig({
        soNgayBaoTruocDoiGioLam: 3,
      });
      await call('post', `/${w.mineRequest}/approve`, w.system, {
        hieuLucTu: '2099-01-01 08:00:00',
      }).expect(200);
      const denied = await call(
        'post',
        `/${w.mineRequest}/cancel`,
        w.branchAdmin,
        { lyDo: 'x' },
      ).expect(403);
      expect(denied.body).toMatchObject({ maLoi: 'KHONG_DU_QUYEN' });
      await call('post', `/${w.mineRequest}/cancel`, w.system, {}).expect(400);
      await call('post', `/${w.mineRequest}/cancel`, w.system, {
        lyDo: 'x',
        nguoiHuyId: '1',
      }).expect(400);
      const ok = await call('post', `/${w.mineRequest}/cancel`, w.system, {
        lyDo: '  Duyệt nhầm  ',
      }).expect(200);
      expect(ok.body).toMatchObject({
        trangThai: 'DaHuy',
        lyDoHuy: 'Duyệt nhầm',
      });
      const pending = await call(
        'post',
        `/${w.otherRequest}/cancel`,
        w.system,
        { lyDo: 'x' },
      ).expect(409);
      expect(pending.body).toMatchObject({
        maLoi: 'YEU_CAU_KHONG_THE_RUT_HUY',
      });
    });
  });
});
