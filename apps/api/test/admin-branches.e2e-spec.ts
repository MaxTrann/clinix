import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AdminFixtures } from '../src/admin/testing/admin-fixtures.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { insertTaiKhoan } from '../src/auth/entities/testing/auth-fixtures.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';

const makeSchedule = () =>
  Array.from({ length: 7 }, (_, index) => ({
    thuTrongTuan: index + 1,
    hoatDong: index !== 6,
    ...(index === 6 ? {} : { sang: { batDau: '08:00', ketThuc: '12:00' } }),
  }));
const createBody = (overrides: Record<string, unknown> = {}) => ({
  ten: 'Chi nhánh HTTP',
  diaChi: 'Địa chỉ HTTP',
  lichHoatDong: makeSchedule(),
  dichVuKhamIds: [],
  ...overrides,
});

describe('B7 CN/PQ — HTTP AppModule/Auth/C1/MySQL thật', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let sessions: SessionService;
  let systemToken: string;
  let branchToken: string;
  let branchId: string;
  let otherBranchId: string;
  const base = '/admin/branches';

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
  beforeEach(async () => {
    await resetTables(db);
    const fixtures = new AdminFixtures(db);
    const branch = await fixtures.branch({ ten: 'Chi nhánh của tôi' });
    const other = await fixtures.branch({ ten: 'Chi nhánh khác' });
    branchId = branch.chiNhanhId;
    otherBranchId = other.chiNhanhId;
    const system = await fixtures.admin();
    const branchAdmin = await fixtures.admin(branch);
    systemToken = (await sessions.create(system.account.taiKhoanId))
      .accessToken;
    branchToken = (await sessions.create(branchAdmin.account.taiKhoanId))
      .accessToken;
  });
  afterAll(async () => app?.close());

  const list = (token = systemToken) =>
    request(app.getHttpServer()).get(base).auth(token, { type: 'bearer' });
  const detail = (id: string, token = systemToken) =>
    request(app.getHttpServer())
      .get(`${base}/${id}`)
      .auth(token, { type: 'bearer' });
  const create = (body: object, token = systemToken) =>
    request(app.getHttpServer())
      .post(base)
      .auth(token, { type: 'bearer' })
      .send(body);

  it('CN-01/12: tạo qua HTTP, trả 201 đúng shape và GET list/detail đọc lại', async () => {
    const { service } = await new AdminFixtures(db).catalog();
    const response = await create(
      createBody({
        toaDoLat: '10.1234567',
        toaDoLng: '106.1234567',
        dichVuKhamIds: [service.dichVuKhamId, service.dichVuKhamId],
      }),
    ).expect(201);
    expect(response.body).toMatchObject({
      chiNhanhId: expect.any(String),
      ten: 'Chi nhánh HTTP',
      diaChi: 'Địa chỉ HTTP',
      toaDoLat: '10.1234567',
      toaDoLng: '106.1234567',
      coYeuCauDangMo: false,
      dichVuKham: [{ dichVuKhamId: service.dichVuKhamId, ten: service.ten }],
    });
    expect(response.body.lichHoatDong).toHaveLength(7);
    expect(response.body.lichHoatDong[0]).toMatchObject({
      thuTrongTuan: 1,
      hoatDong: true,
      sang: { batDau: '08:00:00', ketThuc: '12:00:00' },
    });
    expect((await detail(response.body.chiNhanhId).expect(200)).body).toEqual(
      response.body,
    );
    expect((await list().expect(200)).body.total).toBe(3);
  });

  it('CN-02/PQ-11/13: scope Chi nhánh chỉ thấy chi nhánh mình; ngoài phạm vi đồng nhất 404', async () => {
    const response = await list(branchToken).expect(200);
    expect(response.body).toMatchObject({
      total: 1,
      items: [{ chiNhanhId: branchId, ten: 'Chi nhánh của tôi' }],
    });
    const outOfScope = await detail(otherBranchId, branchToken);
    const missing = await detail('9223372036854775807', branchToken);
    expectErrorResponse(outOfScope, 404, 'KHONG_TIM_THAY');
    expect(outOfScope.body).toEqual(missing.body);
    expectErrorResponse(
      await create(createBody(), branchToken),
      403,
      'KHONG_DU_QUYEN',
    );
    expect((await list()).body.total).toBe(2);
  });

  it('CN-03…11: lịch và cặp tọa độ sai trả đúng lỗi, không ghi DB', async () => {
    const schedule = makeSchedule();
    schedule[0] = {
      thuTrongTuan: 1,
      hoatDong: true,
      sang: { batDau: '25:00', ketThuc: '12:00' },
    };
    schedule[1] = { thuTrongTuan: 2, hoatDong: true };
    const response = await create(createBody({ lichHoatDong: schedule }));
    expectErrorResponse(response, 400, 'LICH_HOAT_DONG_KHONG_HOP_LE');
    expect(response.body.chiTiet).toEqual(
      expect.arrayContaining([
        { thu: 1, maLoi: 'GIO_KHONG_HOP_LE' },
        { thu: 2, maLoi: 'NGAY_HOAT_DONG_THIEU_KHOANG' },
      ]),
    );
    expectErrorResponse(
      await create(createBody({ toaDoLat: '10' })),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expectErrorResponse(
      await create(createBody({ toaDoLat: '91', toaDoLng: '0' })),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    const counts: { total: string | number }[] = await db.query(
      'SELECT COUNT(*) AS total FROM chi_nhanh',
    );
    expect(Number(counts[0]!.total)).toBe(2);
  });

  it('PQ: tìm theo tên/địa chỉ, phân trang; auth thiếu và role không phải Admin bị chặn', async () => {
    await create(
      createBody({ ten: 'Chi nhánh tìm kiếm', diaChi: 'Địa chỉ 50%_!' }),
    ).expect(201);
    expect((await list().query({ q: '%_!' }).expect(200)).body).toMatchObject({
      total: 1,
      items: [{ ten: 'Chi nhánh tìm kiếm' }],
    });
    expect(
      (await list().query({ page: 1, pageSize: 1 }).expect(200)).body,
    ).toMatchObject({
      total: 3,
      page: 1,
      pageSize: 1,
    });
    expectErrorResponse(
      await request(app.getHttpServer()).get(base),
      401,
      'CHUA_DANG_NHAP',
    );
    const patient = await insertTaiKhoan(db, {
      loaiTaiKhoan: 'BenhNhan',
      daXacMinhEmail: true,
    });
    const patientToken = (await sessions.create(patient.taiKhoanId))
      .accessToken;
    expectErrorResponse(await list(patientToken), 403, 'KHONG_DU_QUYEN');
    expectErrorResponse(
      await list().query({ page: 0 }),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
  });

  it('từ chối field lạ và dịch vụ không tồn tại', async () => {
    expectErrorResponse(
      await create(createBody({ phamVi: 'ToanHeThong' })),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expectErrorResponse(
      await create(createBody({ dichVuKhamIds: ['9223372036854775807'] })),
      404,
      'KHONG_TIM_THAY',
    );
    expect((await list()).body.total).toBe(2);
  });
});
