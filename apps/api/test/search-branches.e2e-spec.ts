import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { SearchFixtures } from '../src/search/testing/search-fixtures.js';

describe('B1 — GET /public/branches (HTTP, AppModule, MySQL thật)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fixtures: SearchFixtures;
  let patientToken: string;
  let branchId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    fixtures = new SearchFixtures(db);
  });

  beforeEach(async () => {
    await resetTables(db);
    const branch = await fixtures.branchWithCoordinates({ ten: 'Chi nhánh 1' });
    branchId = branch.chiNhanhId;
    await fixtures.partialWeeklySchedule(branchId, [1, 2, 3, 4, 5]);
    await fixtures.publicDoctor(branch);
    const patient = await fixtures.admin.patient();
    patientToken = (
      await app.get(SessionService).create(patient.account.taiKhoanId)
    ).accessToken;
  });

  afterAll(async () => app?.close());

  const get = (path: string, token?: string) => {
    const call = request(app.getHttpServer()).get(path);
    return token ? call.auth(token, { type: 'bearer' }) : call;
  };

  it('CC-01: danh sách không token ⇒ 200, đúng hợp đồng phân trang', async () => {
    const { body } = await get('/public/branches').expect(200);
    expect(body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(body.items[0]).toEqual({
      chiNhanhId: branchId,
      ten: 'Chi nhánh 1',
      diaChi: 'Địa chỉ minh họa',
      toaDoLat: '10.7769000',
      toaDoLng: '106.7009000',
    });
  });

  it('TCN-06 + TCN-07: chi tiết có 7 thứ (thứ 6, 7 null), dịch vụ và soBacSi', async () => {
    const { body } = await get(`/public/branches/${branchId}`).expect(200);
    expect(body.lichHoatDong).toHaveLength(7);
    expect(body.lichHoatDong[0].hoatDong).toEqual({
      sang: { tu: '08:00', den: '12:00' },
      chieu: { tu: '13:00', den: '17:00' },
    });
    expect(body.lichHoatDong[5].hoatDong).toBeNull();
    expect(body.lichHoatDong[6].hoatDong).toBeNull();
    expect(body.dichVuKham).toHaveLength(1);
    expect(body.soBacSi).toBe(1);
  });

  it('TCN-05: q 101 ký tự ⇒ 400 TU_KHOA_KHONG_HOP_LE; 100 ký tự ⇒ 200', async () => {
    const bad = await get(`/public/branches?q=${'a'.repeat(101)}`);
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toContain('TU_KHOA_KHONG_HOP_LE');
    await get(`/public/branches?q=${'a'.repeat(100)}`).expect(200);
  });

  it('TCN-10: pageSize 101 ⇒ 400; page 0 ⇒ 400; pageSize 100 ⇒ 200', async () => {
    await get('/public/branches?pageSize=101').expect(400);
    await get('/public/branches?page=0').expect(400);
    await get('/public/branches?pageSize=100').expect(200);
  });

  it('TCN-08: id không có / sai dạng ⇒ 404 KHONG_TIM_THAY cùng thân', async () => {
    const bodies: unknown[] = [];
    for (const id of ['999999', 'abc', '-1', '0', '9223372036854775808']) {
      const response = await get(`/public/branches/${id}`);
      expectErrorResponse(response, 404, 'KHONG_TIM_THAY');
      const { requestId: _ignored, ...rest } = response.body as Record<
        string,
        unknown
      >;
      bodies.push(rest);
    }
    for (const body of bodies) expect(body).toEqual(bodies[0]);
  });

  it('CC-02/CC-03: token bệnh nhân, token sai ⇒ thân giống hệt không token', async () => {
    const anonymous = (await get('/public/branches').expect(200))
      .body as unknown;
    expect(
      (await get('/public/branches', patientToken).expect(200)).body,
    ).toEqual(anonymous);
    expect(
      (await get('/public/branches', 'khong-phai-jwt').expect(200)).body,
    ).toEqual(anonymous);
  });

  it('CC-05: POST/PUT/PATCH/DELETE ⇒ 404 KHONG_TIM_THAY', async () => {
    const calls = [
      () => request(app.getHttpServer()).post('/public/branches').send({}),
      () =>
        request(app.getHttpServer())
          .put(`/public/branches/${branchId}`)
          .send({}),
      () =>
        request(app.getHttpServer())
          .patch(`/public/branches/${branchId}`)
          .send({}),
      () => request(app.getHttpServer()).delete(`/public/branches/${branchId}`),
    ];
    for (const call of calls) {
      expectErrorResponse(await call(), 404, 'KHONG_TIM_THAY');
    }
  });

  it('CC-06: tham số lạ ⇒ 400 TRUONG_KHONG_DUOC_PHEP', async () => {
    const response = await get('/public/branches?trangThai=NgungHoatDong');
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('TRUONG_KHONG_DUOC_PHEP');
  });

  it('AN-05: không lộ khoá nhạy cảm nào trong chi tiết', async () => {
    const { body } = await get(`/public/branches/${branchId}`).expect(200);
    const text = JSON.stringify(body);
    for (const key of ['email', 'soDienThoai', 'matKhau', 'trangThai']) {
      expect(text).not.toContain(`"${key}"`);
    }
  });
});
