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

// Admin B8 — CNB-03: `PATCH /admin/branches/:id` qua HTTP (AppModule, Auth, C1, MySQL thật): vai trò, phạm vi, dữ liệu vào sai.
const schedule = () =>
  Array.from({ length: 7 }, (_, i) => ({
    thuTrongTuan: i + 1,
    hoatDong: true,
    sang: { batDau: '08:00', ketThuc: '12:00' },
    chieu: { batDau: '13:00', ketThuc: '17:00' },
  }));

describe('B8 sửa chi nhánh — HTTP', () => {
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
      .patch(`/admin/branches/${id}`)
      .send(body);
    return token ? req.auth(token, { type: 'bearer' }) : req;
  };

  async function world() {
    const fx = new AdminFixtures(db);
    const mine = await fx.branch({ ten: 'Chi nhánh A', diaChi: 'Địa chỉ A' });
    const other = await fx.branch({ ten: 'Chi nhánh B', diaChi: 'Địa chỉ B' });
    await fx.weeklySchedule(mine.chiNhanhId);
    await fx.weeklySchedule(other.chiNhanhId);
    const doctor = await fx.doctor(mine);
    return {
      mine,
      other,
      body: (ten: string) => ({
        ten,
        diaChi: 'Địa chỉ A',
        lichHoatDong: schedule(),
        dichVuKhamIds: [doctor.profile.dichVuKhamId],
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

  it('CNB-03 chưa đăng nhập ⇒ 401; Bệnh nhân, Bác sĩ, Lễ tân ⇒ 403', async () => {
    const w = await world();
    await patch(w.mine.chiNhanhId, w.body('Mới')).expect(401);
    for (const token of [w.patient, w.doctor, w.receptionist])
      await patch(w.mine.chiNhanhId, w.body('Mới'), token).expect(403);
  });

  it('CNB-03 Chi nhánh sửa chi nhánh mình ⇒ 200 kèm daLuu; chi nhánh khác ⇒ 404; Toàn hệ thống sửa được cả hai', async () => {
    const w = await world();
    const ok = await patch(
      w.mine.chiNhanhId,
      w.body('Tên mới'),
      w.branchAdmin,
    ).expect(200);
    expect(ok.body).toMatchObject({
      daLuu: ['ten'],
      yeuCau: null,
      chiNhanh: { ten: 'Tên mới' },
    });
    const hidden = await patch(
      w.other.chiNhanhId,
      { ...w.body('X'), dichVuKhamIds: [] },
      w.branchAdmin,
    ).expect(404);
    expect(hidden.body).toMatchObject({ maLoi: 'KHONG_TIM_THAY' });
    await patch(
      w.other.chiNhanhId,
      { ...w.body('Chi nhánh B2'), diaChi: 'Địa chỉ B', dichVuKhamIds: [] },
      w.system,
    ).expect(200);
  });

  it('CNB-03 dữ liệu vào sai ⇒ 400: id sai, thiếu lịch, lịch sai, trường lạ; không đổi gì ⇒ 400 KHONG_CO_THAY_DOI', async () => {
    const w = await world();
    await patch('abc', w.body('X'), w.system).expect(400);
    await patch(
      w.mine.chiNhanhId,
      { ...w.body('X'), lichHoatDong: schedule().slice(0, 6) },
      w.system,
    ).expect(400);
    await patch(
      w.mine.chiNhanhId,
      { ...w.body('X'), nguoiDeXuatId: '1' },
      w.system,
    ).expect(400);
    const same = await patch(
      w.mine.chiNhanhId,
      w.body('Chi nhánh A'),
      w.system,
    ).expect(400);
    expect(same.body).toMatchObject({ maLoi: 'KHONG_CO_THAY_DOI' });
  });
});
