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

describe('B8 — GET /public/suggestions (HTTP, AppModule, MySQL thật)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fixtures: SearchFixtures;
  let patientToken: string;
  let doctorId: string;

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
    const d = await fixtures.publicDoctor(
      branch,
      {},
      { hoTen: 'Nguyễn Văn Tim', email: 'tim.doctor@example.com' },
    );
    doctorId = d.account.taiKhoanId;
    await db.query('UPDATE chuyen_khoa SET ten = ? WHERE chuyen_khoa_id = ?', [
      'Tim mạch',
      d.profile.chuyenKhoaId,
    ]);
    await fixtures.pendingDoctor(branch);
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

  it('CC-01 + Q20: không token ⇒ 200, ba nhóm, không lộ email', async () => {
    const { body } = await get('/public/suggestions?q=tim').expect(200);
    expect(Object.keys(body).sort()).toEqual(['bacSi', 'chuyenKhoa', 'dichVu']);
    expect(body.chuyenKhoa).toEqual([
      { chuyenKhoaId: expect.any(String), ten: 'Tim mạch' },
    ]);
    expect(body.bacSi).toEqual([
      { bacSiId: doctorId, hoTen: 'Nguyễn Văn Tim', chucDanh: 'BS' },
    ]);
    expect(JSON.stringify(body)).not.toContain('tim.doctor@example.com');
  });

  it('Q20: q rỗng hoặc thiếu ⇒ ba mảng rỗng', async () => {
    for (const path of ['/public/suggestions', '/public/suggestions?q=']) {
      const { body } = await get(path).expect(200);
      expect(body).toEqual({ chuyenKhoa: [], dichVu: [], bacSi: [] });
    }
  });

  it('CC-02/03: token hợp lệ hay sai chữ ký đều cho cùng thân phản hồi', async () => {
    const anonymous = await get('/public/suggestions?q=tim').expect(200);
    const withToken = await get('/public/suggestions?q=tim', patientToken);
    const badToken = await get('/public/suggestions?q=tim', 'khong.phai.token');
    expect(withToken.status).toBe(200);
    expect(withToken.body).toEqual(anonymous.body);
    expect(badToken.body).toEqual(anonymous.body);
  });

  it('q quá 100 ký tự ⇒ 400 TU_KHOA_KHONG_HOP_LE; tham số lạ ⇒ 400', async () => {
    const bad = await get(`/public/suggestions?q=${'a'.repeat(101)}`);
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toContain('TU_KHOA_KHONG_HOP_LE');
    await get('/public/suggestions?q=tim&page=2').expect(400);
  });

  it('CC-07: chỉ GET; POST bị từ chối', async () => {
    const response = await request(app.getHttpServer())
      .post('/public/suggestions')
      .send({});
    expect([404, 405]).toContain(response.status);
  });
});
