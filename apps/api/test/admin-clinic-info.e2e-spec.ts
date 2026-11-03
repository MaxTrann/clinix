import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AdminFixtures } from '../src/admin/testing/admin-fixtures.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { ThongTinPhongKham } from '../src/admin/entities/thong-tin-phong-kham.entity.js';
import { resetTables } from '../src/database/testing/test-database.js';

describe('B4 PK — HTTP AppModule/auth/C1/MySQL thật', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let sessions: SessionService;
  let systemToken: string;
  let branchToken: string;
  let doctorToken: string;
  let receptionistToken: string;
  let patientToken: string;
  const base = '/admin/clinic-info';
  const body = {
    tenThuongHieu: 'CLINIX',
    diaChiTruSo: '12 Đường Mẫu, TP. Hồ Chí Minh',
    duongDayNong: '1900 1234',
    email: 'Support@example.com',
  };

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
    const branch = await fixtures.branch();
    systemToken = (
      await sessions.create((await fixtures.admin()).account.taiKhoanId)
    ).accessToken;
    branchToken = (
      await sessions.create((await fixtures.admin(branch)).account.taiKhoanId)
    ).accessToken;
    doctorToken = (
      await sessions.create((await fixtures.doctor(branch)).account.taiKhoanId)
    ).accessToken;
    receptionistToken = (
      await sessions.create(
        (await fixtures.receptionist(branch)).account.taiKhoanId,
      )
    ).accessToken;
    patientToken = (
      await sessions.create((await fixtures.patient()).account.taiKhoanId)
    ).accessToken;
  });

  afterAll(async () => app?.close());

  const get = (token?: string) => {
    const call = request(app.getHttpServer()).get(base);
    return token ? call.auth(token, { type: 'bearer' }) : call;
  };
  const put = (input: object, token?: string) => {
    const call = request(app.getHttpServer()).put(base).send(input);
    return token ? call.auth(token, { type: 'bearer' }) : call;
  };

  it('PK-01/02: GET rỗng và PUT upsert trả đúng bốn field', async () => {
    expect((await get(systemToken).expect(200)).body).toEqual({
      tenThuongHieu: null,
      diaChiTruSo: null,
      duongDayNong: null,
      email: null,
    });

    const saved = await put(body, systemToken).expect(200);
    expect(saved.body).toEqual({
      tenThuongHieu: 'CLINIX',
      diaChiTruSo: '12 Đường Mẫu, TP. Hồ Chí Minh',
      duongDayNong: '19001234',
      email: 'Support@example.com',
    });
    expect(saved.body).not.toHaveProperty('id');
    expect((await get(systemToken).expect(200)).body).toEqual(saved.body);
    expect(await db.getRepository(ThongTinPhongKham).count()).toBe(1);
  });

  it('PK-07/08: Admin Chi nhánh chỉ được GET; chỉ Toàn hệ thống được PUT', async () => {
    expectErrorResponse(await get(), 401, 'CHUA_DANG_NHAP');
    expectErrorResponse(await put(body), 401, 'CHUA_DANG_NHAP');
    const branchRead = await get(branchToken);
    expect(branchRead.status).toBe(200);
    expect(Object.keys(branchRead.body as object).sort()).toEqual([
      'diaChiTruSo',
      'duongDayNong',
      'email',
      'tenThuongHieu',
    ]);
    expectErrorResponse(await put(body, branchToken), 403, 'KHONG_DU_QUYEN');
    for (const token of [doctorToken, receptionistToken, patientToken]) {
      expectErrorResponse(await get(token), 403, 'KHONG_DU_QUYEN');
      expectErrorResponse(await put(body, token), 403, 'KHONG_DU_QUYEN');
    }
  });

  it('PK-03…06: HTTP áp dụng validation và allowlist của DTO', async () => {
    for (const input of [
      { ...body, email: 'a b@example.com' },
      { ...body, duongDayNong: '0123' },
      { ...body, tenThuongHieu: '' },
      { ...body, diaChiTruSo: 'x'.repeat(256) },
      { ...body, extra: true },
      { tenThuongHieu: 'CLINIX' },
    ])
      expectErrorResponse(
        await put(input, systemToken),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
  });
});
