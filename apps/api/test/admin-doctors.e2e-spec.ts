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

// Admin B12 — HSB-04: vai trò và phạm vi của `GET /admin/doctors` và `GET /admin/doctors/:id` qua HTTP (AppModule, Auth, C1, MySQL thật).
describe('B12 hồ sơ bác sĩ (đọc) — HTTP', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let sessions: SessionService;
  const base = '/admin/doctors';

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

  const tokenOf = async (taiKhoanId: string) =>
    (await sessions.create(taiKhoanId)).accessToken;
  const get = (path: string, token?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return token ? req.auth(token, { type: 'bearer' }) : req;
  };

  async function world() {
    const fx = new AdminFixtures(db);
    const mine = await fx.branch({ ten: 'Chi nhánh A' });
    const other = await fx.branch({ ten: 'Chi nhánh B' });
    const ownDoctor = await fx.doctor(mine);
    const otherDoctor = await fx.doctor(other);
    return {
      ownDoctorId: ownDoctor.account.taiKhoanId,
      otherDoctorId: otherDoctor.account.taiKhoanId,
      system: await tokenOf((await fx.admin()).account.taiKhoanId),
      branchAdmin: await tokenOf((await fx.admin(mine)).account.taiKhoanId),
      doctor: await tokenOf(ownDoctor.account.taiKhoanId),
      receptionist: await tokenOf(
        (await fx.receptionist(mine)).account.taiKhoanId,
      ),
      patient: await tokenOf((await fx.patient()).account.taiKhoanId),
    };
  }

  it('HSB-04 chưa đăng nhập ⇒ 401; Bệnh nhân, Bác sĩ, Lễ tân ⇒ 403 ở cả hai endpoint', async () => {
    const w = await world();
    await get(base).expect(401);
    for (const token of [w.patient, w.doctor, w.receptionist]) {
      await get(base, token).expect(403);
      await get(`${base}/${w.ownDoctorId}`, token).expect(403);
    }
  });

  it('HSB-04 Toàn hệ thống thấy hai bác sĩ; Chi nhánh thấy một và bị 404 với bác sĩ chi nhánh khác', async () => {
    const w = await world();
    const all = await get(base, w.system).expect(200);
    expect(all.body).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    const own = await get(base, w.branchAdmin).expect(200);
    expect(
      own.body.items.map((d: { taiKhoanId: string }) => d.taiKhoanId),
    ).toEqual([w.ownDoctorId]);
    await get(`${base}/${w.ownDoctorId}`, w.branchAdmin).expect(200);
    const hidden = await get(
      `${base}/${w.otherDoctorId}`,
      w.branchAdmin,
    ).expect(404);
    expect(hidden.body).toMatchObject({ maLoi: 'KHONG_TIM_THAY' });
  });

  it('HSB-04 id sai định dạng và tham số lạ ⇒ 400', async () => {
    const w = await world();
    await get(`${base}/abc`, w.system).expect(400);
    await get(`${base}?trangThai=DangHoatDong`, w.system).expect(400);
  });
});
