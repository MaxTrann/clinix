import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AdminFixtures } from '../src/admin/testing/admin-fixtures.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { resetTables } from '../src/database/testing/test-database.js';

// Admin B9 — YCB-09 [đề xuất mã]: yêu cầu thay đổi chi nhánh qua HTTP (AppModule, Auth, C1, MySQL thật): vai trò, phạm vi, dữ liệu vào sai.
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
});
