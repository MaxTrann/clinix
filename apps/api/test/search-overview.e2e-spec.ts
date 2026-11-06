import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { SearchFixtures } from '../src/search/testing/search-fixtures.js';

describe('B9 — GET /public/overview (HTTP, AppModule, MySQL thật)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fixtures: SearchFixtures;
  let patientToken: string;

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
    const branch = await fixtures.branchWithCoordinates();
    await fixtures.publicDoctor(branch);
    await fixtures.pendingDoctor(branch);
    await fixtures.suspendedDoctor(branch);
    const patient = await fixtures.admin.patient();
    patientToken = (
      await app.get(SessionService).create(patient.account.taiKhoanId)
    ).accessToken;
  });

  afterAll(async () => app?.close());

  const get = (token?: string) => {
    const call = request(app.getHttpServer()).get('/public/overview');
    return token ? call.auth(token, { type: 'bearer' }) : call;
  };

  it('CC-01 + TCH-01: không token ⇒ 200, đúng ba trường, bác sĩ ẩn không được đếm', async () => {
    const { body } = await get().expect(200);
    expect(Object.keys(body).sort()).toEqual(
      ['soBacSi', 'soChuyenKhoa', 'soDichVu'].sort(),
    );
    expect(body.soBacSi).toBe(1);
    expect(typeof body.soChuyenKhoa).toBe('number');
    expect(typeof body.soDichVu).toBe('number');
  });

  it('CC-02/03: token hợp lệ hay sai chữ ký đều cho cùng thân phản hồi', async () => {
    const anonymous = await get().expect(200);
    expect((await get(patientToken).expect(200)).body).toEqual(anonymous.body);
    expect((await get('khong.phai.token').expect(200)).body).toEqual(
      anonymous.body,
    );
  });

  it('CC-07: chỉ GET; POST bị từ chối', async () => {
    const response = await request(app.getHttpServer())
      .post('/public/overview')
      .send({});
    expect([404, 405]).toContain(response.status);
  });
});
