import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AdminFixtures } from '../src/admin/testing/admin-fixtures.js';
import { ThongTinPhongKham } from '../src/admin/entities/thong-tin-phong-kham.entity.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';

describe('B7 — GET /public/clinic-info (HTTP, AppModule, MySQL thật)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let tokens: Record<string, string>;
  const path = '/public/clinic-info';
  const stored = {
    id: 1,
    tenThuongHieu: 'CLINIX',
    diaChiTruSo: '12 Đường Mẫu, TP. Hồ Chí Minh',
    duongDayNong: '19001234',
    email: 'support@example.com',
  };
  const expected = {
    tenThuongHieu: 'CLINIX',
    diaChiTruSo: '12 Đường Mẫu, TP. Hồ Chí Minh',
    duongDayNong: '19001234',
    email: 'support@example.com',
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetTables(db);
    const sessions = app.get(SessionService);
    const fixtures = new AdminFixtures(db);
    const branch = await fixtures.branch();
    const tokenOf = async (accountId: string) =>
      (await sessions.create(accountId)).accessToken;
    tokens = {
      patient: await tokenOf((await fixtures.patient()).account.taiKhoanId),
      doctor: await tokenOf((await fixtures.doctor(branch)).account.taiKhoanId),
      receptionist: await tokenOf(
        (await fixtures.receptionist(branch)).account.taiKhoanId,
      ),
      admin: await tokenOf((await fixtures.admin()).account.taiKhoanId),
    };
  });

  afterAll(async () => app?.close());

  const get = (token?: string) => {
    const call = request(app.getHttpServer()).get(path);
    return token ? call.auth(token, { type: 'bearer' }) : call;
  };

  it('CC-01 + AN-04: không token, chưa có dòng nào ⇒ 200 và bốn trường null', async () => {
    const response = await get().expect(200);
    expect(response.body).toEqual({
      tenThuongHieu: null,
      diaChiTruSo: null,
      duongDayNong: null,
      email: null,
    });
  });

  it('KC-05: có dữ liệu ⇒ đúng bốn trường, không lộ id hay cột khác', async () => {
    await db.getRepository(ThongTinPhongKham).save(stored);
    const response = await get().expect(200);
    expect(response.body).toEqual(expected);
    expect(response.body).not.toHaveProperty('id');
  });

  it('CC-02: token đúng của 4 vai trò ⇒ thân giống hệt khi không token (Q17)', async () => {
    await db.getRepository(ThongTinPhongKham).save(stored);
    const anonymous = (await get().expect(200)).body as unknown;
    for (const token of Object.values(tokens)) {
      expect((await get(token).expect(200)).body).toEqual(anonymous);
    }
  });

  it('CC-03: token sai định dạng, sai chữ ký ⇒ vẫn 200, không 401', async () => {
    await db.getRepository(ThongTinPhongKham).save(stored);
    const valid = tokens.patient ?? '';
    const [header, payload] = valid.split('.');
    const badSignature = `${header}.${payload}.${'A'.repeat(43)}`;
    for (const token of ['khong-phai-jwt', badSignature]) {
      expect((await get(token).expect(200)).body).toEqual(expected);
    }
  });

  it('CC-05: POST/PUT/PATCH/DELETE vào /public/clinic-info ⇒ 404 KHONG_TIM_THAY', async () => {
    const calls = [
      () => request(app.getHttpServer()).post(path).send({}),
      () => request(app.getHttpServer()).put(path).send({}),
      () => request(app.getHttpServer()).patch(path).send({}),
      () => request(app.getHttpServer()).delete(path),
    ];
    // Tạo request lần lượt (không dựng sẵn cả mảng) để supertest không đóng server tạm của request trước.
    for (const call of calls) {
      expectErrorResponse(await call(), 404, 'KHONG_TIM_THAY');
    }
  });

  it('CC-07: gọi nhiều lần không đổi dữ liệu', async () => {
    await db.getRepository(ThongTinPhongKham).save(stored);
    const checksum = () =>
      db.query<unknown[]>('CHECKSUM TABLE thong_tin_phong_kham');
    const before = await checksum();
    await get().expect(200);
    await get(tokens.admin).expect(200);
    expect(await checksum()).toEqual(before);
  });
});
