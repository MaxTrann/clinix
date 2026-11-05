import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ChiNhanhDichVuKham } from '../src/admin/entities/chi-nhanh-dich-vu-kham.entity.js';
import { DichVuKham } from '../src/admin/entities/dich-vu-kham.entity.js';
import { NhomDichVu } from '../src/admin/entities/nhom-dich-vu.entity.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { SearchFixtures } from '../src/search/testing/search-fixtures.js';

describe('B3 — GET /public/service-groups, /public/services (HTTP, AppModule, MySQL thật)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fixtures: SearchFixtures;
  let patientToken: string;
  let branchId: string;
  let groupId: string;
  let serviceId: string;

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
    const groups = db.getRepository(NhomDichVu);
    const group = await groups.save(
      groups.create({ ten: 'Khám chuyên khoa', thuTuHienThi: 1 }),
    );
    await groups.save(
      groups.create({ ten: 'Tầm soát ung thư', thuTuHienThi: 2 }),
    );
    const services = db.getRepository(DichVuKham);
    const service = await services.save(
      services.create({
        nhomDichVuId: group.nhomDichVuId,
        ten: 'Tim mạch',
        thoiLuong: 30,
        giaMacDinh: '200000.00',
        mucDatCoc: '50000.00',
      }),
    );
    groupId = group.nhomDichVuId;
    serviceId = service.dichVuKhamId;
    const branch = await fixtures.branchWithCoordinates();
    branchId = branch.chiNhanhId;
    const links = db.getRepository(ChiNhanhDichVuKham);
    await links.save(
      links.create({ chiNhanhId: branchId, dichVuKhamId: serviceId }),
    );
    await fixtures.publicDoctor(branch, { dichVuKhamId: serviceId });
    // AdminFixtures.doctor() tự tạo thêm nhóm/dịch vụ mẫu; xoá để danh sách chỉ còn dữ liệu của test.
    await fixtures.pruneUnusedFixtureServices();
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

  it('CC-01 + TBS-01: nhóm không token ⇒ 200, đúng thứ tự, nhóm rỗng "sắp triển khai"', async () => {
    const { body } = await get('/public/service-groups').expect(200);
    expect(body.items).toEqual([
      {
        nhomDichVuId: groupId,
        ten: 'Khám chuyên khoa',
        soDichVu: 1,
        giaTu: '200000.00',
        sapTrienKhai: false,
      },
      expect.objectContaining({
        ten: 'Tầm soát ung thư',
        soDichVu: 0,
        giaTu: null,
        sapTrienKhai: true,
      }),
    ]);
  });

  it('TBS-02: dịch vụ của nhóm ⇒ 200 đúng bảy trường, soBacSi đếm bác sĩ công khai', async () => {
    const { body } = await get(
      `/public/services?nhomDichVuId=${groupId}&chiNhanhId=${branchId}`,
    ).expect(200);
    expect(body.items).toEqual([
      {
        dichVuKhamId: serviceId,
        ten: 'Tim mạch',
        nhomDichVu: { id: groupId, ten: 'Khám chuyên khoa' },
        thoiLuong: 30,
        giaMacDinh: '200000.00',
        mucDatCoc: '50000.00',
        soBacSi: 1,
      },
    ]);
  });

  it('TBS-15: chi nhánh / nhóm không tồn tại ⇒ 200 rỗng; id sai dạng ⇒ 400 BO_LOC_KHONG_HOP_LE kèm trường', async () => {
    const none = await get('/public/services?nhomDichVuId=999999').expect(200);
    expect(none.body).toEqual({ items: [] });
    const noBranch = await get('/public/services?chiNhanhId=999999').expect(
      200,
    );
    expect(noBranch.body).toEqual({ items: [] });
    const groupsNoBranch = await get(
      '/public/service-groups?chiNhanhId=999999',
    ).expect(200);
    expect(
      groupsNoBranch.body.items.every(
        (i: { sapTrienKhai: boolean }) => i.sapTrienKhai,
      ),
    ).toBe(true);

    for (const [path, field] of [
      ['/public/services?nhomDichVuId=abc', 'nhomDichVuId'],
      ['/public/services?chiNhanhId=abc', 'chiNhanhId'],
      ['/public/service-groups?chiNhanhId=0', 'chiNhanhId'],
    ] as const) {
      const response = await get(path);
      expectErrorResponse(response, 400, 'BO_LOC_KHONG_HOP_LE');
      expect(response.body.loi).toEqual([
        { truong: field, ma: 'ID_LOC_KHONG_HOP_LE' },
      ]);
    }
  });

  it('CC-02/CC-03: token bệnh nhân, token sai ⇒ thân giống hệt không token (cả hai endpoint)', async () => {
    for (const path of ['/public/service-groups', '/public/services']) {
      const anonymous = (await get(path).expect(200)).body as unknown;
      expect((await get(path, patientToken).expect(200)).body).toEqual(
        anonymous,
      );
      expect((await get(path, 'khong-phai-jwt').expect(200)).body).toEqual(
        anonymous,
      );
    }
  });

  it('CC-05: POST/PUT/PATCH/DELETE ⇒ 404 KHONG_TIM_THAY', async () => {
    const server = app.getHttpServer();
    const calls = [
      () => request(server).post('/public/services').send({}),
      () => request(server).put('/public/service-groups').send({}),
      () => request(server).patch('/public/services').send({}),
      () => request(server).delete('/public/service-groups'),
    ];
    for (const call of calls) {
      expectErrorResponse(await call(), 404, 'KHONG_TIM_THAY');
    }
  });

  it('CC-06: tham số lạ (kể cả phân trang, vì endpoint không phân trang) ⇒ 400 TRUONG_KHONG_DUOC_PHEP', async () => {
    for (const path of [
      '/public/service-groups?trangThai=x',
      '/public/services?q=tim',
      '/public/services?page=1',
    ]) {
      const response = await get(path);
      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain('TRUONG_KHONG_DUOC_PHEP');
    }
  });

  it('AN: không lộ khoá nhạy cảm (thứ tự hiển thị, thông tin bác sĩ)', async () => {
    const text = JSON.stringify([
      (await get('/public/service-groups').expect(200)).body,
      (await get('/public/services').expect(200)).body,
    ]);
    for (const key of [
      'thuTuHienThi',
      'email',
      'soDienThoai',
      'matKhau',
      'trangThai',
    ]) {
      expect(text).not.toContain(`"${key}"`);
    }
  });
});
