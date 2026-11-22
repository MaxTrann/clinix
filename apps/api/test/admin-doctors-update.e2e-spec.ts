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

// Admin B13 — HSS-04 [đề xuất mã]: `PATCH /admin/doctors/:id` qua HTTP (AppModule, Auth, C1, MySQL thật): vai trò, phạm vi, dữ liệu vào sai.
describe('B13 sửa hồ sơ bác sĩ — HTTP', () => {
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
  const patch = (id: string, body: object, token?: string) => {
    const req = request(app.getHttpServer())
      .patch(`/admin/doctors/${id}`)
      .send(body);
    return token ? req.auth(token, { type: 'bearer' }) : req;
  };

  async function world() {
    const fx = new AdminFixtures(db);
    const mine = await fx.branch({ ten: 'Chi nhánh A' });
    const other = await fx.branch({ ten: 'Chi nhánh B' });
    const doctor = await fx.doctor(mine);
    const otherDoctor = await fx.doctor(other);
    const p = doctor.profile;
    return {
      mine,
      other,
      doctorId: doctor.account.taiKhoanId,
      otherDoctorId: otherDoctor.account.taiKhoanId,
      body: (over: object = {}) => ({
        chuyenKhoaId: p.chuyenKhoaId,
        chiNhanhId: p.chiNhanhId,
        dichVuKhamId: p.dichVuKhamId,
        chucDanh: 'ThS_BS',
        hocVi: 'ThS',
        soNamKinhNghiem: 4,
        ...over,
      }),
      system: await tokenOf((await fx.admin()).account.taiKhoanId),
      branchAdmin: await tokenOf((await fx.admin(mine)).account.taiKhoanId),
      doctor: await tokenOf(doctor.account.taiKhoanId),
      receptionist: await tokenOf(
        (await fx.receptionist(mine)).account.taiKhoanId,
      ),
      patient: await tokenOf((await fx.patient()).account.taiKhoanId),
    };
  }

  it('HSS-04 chưa đăng nhập ⇒ 401; Bệnh nhân, Bác sĩ (kể cả tự sửa hồ sơ mình), Lễ tân ⇒ 403', async () => {
    const w = await world();
    await patch(w.doctorId, w.body()).expect(401);
    for (const token of [w.patient, w.doctor, w.receptionist])
      await patch(w.doctorId, w.body(), token).expect(403);
  });

  it('HSS-04 Chi nhánh sửa bác sĩ của mình ⇒ 200; bác sĩ chi nhánh khác ⇒ 404; đổi chi nhánh ⇒ 403', async () => {
    const w = await world();
    const ok = await patch(w.doctorId, w.body(), w.branchAdmin).expect(200);
    expect(ok.body).toMatchObject({
      taiKhoanId: w.doctorId,
      chucDanh: 'ThS_BS',
      hocVi: 'ThS',
      soNamKinhNghiem: 4,
    });
    expect(ok.body).not.toHaveProperty('matKhauBam');
    const hidden = await patch(w.otherDoctorId, w.body(), w.branchAdmin).expect(
      404,
    );
    expect(hidden.body).toMatchObject({ maLoi: 'KHONG_TIM_THAY' });
    const denied = await patch(
      w.doctorId,
      w.body({ chiNhanhId: w.other.chiNhanhId, soNamKinhNghiem: 5 }),
      w.branchAdmin,
    ).expect(403);
    expect(denied.body).toMatchObject({ maLoi: 'KHONG_DU_QUYEN' });
  });

  it('HSS-04 dữ liệu vào sai ⇒ 400: id sai, thiếu trường, trường lạ, chức danh–học vị lệch; không đổi ⇒ KHONG_CO_THAY_DOI', async () => {
    const w = await world();
    await patch('abc', w.body(), w.system).expect(400);
    const { hocVi: _omit, ...missing } = w.body();
    await patch(w.doctorId, missing, w.system).expect(400);
    await patch(w.doctorId, w.body({ hoTen: 'Tên mới' }), w.system).expect(400);
    const mismatch = await patch(
      w.doctorId,
      w.body({ chucDanh: 'GS_TS_BS', hocVi: 'BS' }),
      w.system,
    ).expect(400);
    expect(mismatch.body).toMatchObject({
      maLoi: 'CHUC_DANH_HOC_VI_KHONG_TUONG_THICH',
    });
    await patch(w.doctorId, w.body(), w.system).expect(200);
    const same = await patch(w.doctorId, w.body(), w.system).expect(400);
    expect(same.body).toMatchObject({ maLoi: 'KHONG_CO_THAY_DOI' });
  });
});
