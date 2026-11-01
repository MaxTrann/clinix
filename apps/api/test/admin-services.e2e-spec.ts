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

describe('B3 DV — HTTP AppModule/auth/C1/MySQL thật', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let sessions: SessionService;
  let systemId: string;
  let systemToken: string;
  let branchToken: string;
  let groupId: string;
  const base = '/admin/services';

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
    const catalog = await fixtures.catalog();
    groupId = catalog.group.nhomDichVuId;
    const branch = await fixtures.branch();
    systemId = (await fixtures.admin()).account.taiKhoanId;
    systemToken = (await sessions.create(systemId)).accessToken;
    branchToken = (
      await sessions.create((await fixtures.admin(branch)).account.taiKhoanId)
    ).accessToken;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => app?.close());

  const get = (token = systemToken) =>
    request(app.getHttpServer()).get(base).auth(token, { type: 'bearer' });
  const getOne = (id: string, token = systemToken) =>
    request(app.getHttpServer())
      .get(`${base}/${id}`)
      .auth(token, { type: 'bearer' });
  const post = (body: object, token = systemToken) =>
    request(app.getHttpServer())
      .post(base)
      .auth(token, { type: 'bearer' })
      .send(body);
  const patch = (id: string, body: object, token = systemToken) =>
    request(app.getHttpServer())
      .patch(`${base}/${id}`)
      .auth(token, { type: 'bearer' })
      .send(body);
  const remove = (id: string, token = systemToken) =>
    request(app.getHttpServer())
      .delete(`${base}/${id}`)
      .auth(token, { type: 'bearer' });

  it('DV-07/12/13/19: POST/GET/PATCH, allowlist response, không có DELETE', async () => {
    const created = await post({
      nhomDichVuId: groupId,
      ten: ' Khám\t tổng quát ',
      thoiLuong: 30,
      giaMacDinh: '250.00',
    }).expect(201);
    const id = String(created.body.dichVuKhamId);
    expect(created.body).toEqual({
      dichVuKhamId: expect.any(String),
      nhomDichVuId: groupId,
      tenNhom: expect.any(String),
      ten: 'Khám tổng quát',
      thoiLuong: 30,
      giaMacDinh: '250.00',
    });
    expect(created.body).not.toHaveProperty('mucDatCoc');
    expect((await getOne(id).expect(200)).body).toEqual(created.body);
    await remove(id).expect(404);
    expect((await getOne(id).expect(200)).body).toEqual(created.body);
    expect(
      (await patch(id, { giaMacDinh: '300.50' }).expect(200)).body,
    ).toMatchObject({ ten: 'Khám tổng quát', giaMacDinh: '300.50' });
    expect((await get().expect(200)).body).toMatchObject({
      total: 2,
      page: 1,
      pageSize: 20,
    });
  });

  it('DV-08/09/10/11/18: validation, field lạ, group not found và ID', async () => {
    for (const body of [
      {},
      { nhomDichVuId: groupId, ten: ' ', thoiLuong: 30, giaMacDinh: '1.00' },
      { nhomDichVuId: groupId, ten: 'Mẫu', thoiLuong: 0, giaMacDinh: '1.00' },
      {
        nhomDichVuId: groupId,
        ten: 'Mẫu',
        thoiLuong: 30.5,
        giaMacDinh: '1.00',
      },
      { nhomDichVuId: groupId, ten: 'Mẫu', thoiLuong: 30, giaMacDinh: '0.00' },
      { nhomDichVuId: groupId, ten: 'Mẫu', thoiLuong: 30, giaMacDinh: '1.001' },
      {
        nhomDichVuId: groupId,
        ten: 'Mẫu',
        thoiLuong: 30,
        giaMacDinh: '1.00',
        mucDatCoc: '0.00',
      },
      {
        nhomDichVuId: groupId,
        ten: 'Mẫu',
        thoiLuong: 30,
        giaMacDinh: '1.00',
        chinhSachHoan: [],
      },
    ])
      expectErrorResponse(await post(body), 400, 'DU_LIEU_KHONG_HOP_LE');
    expectErrorResponse(
      await post({
        nhomDichVuId: '999999',
        ten: 'Mẫu',
        thoiLuong: 30,
        giaMacDinh: '1.00',
      }),
      400,
      'NHOM_DICH_VU_KHONG_TON_TAI',
    );

    const row = await post({
      nhomDichVuId: groupId,
      ten: 'Giữ',
      thoiLuong: 30,
      giaMacDinh: '10.00',
    }).expect(201);
    const id = String(row.body.dichVuKhamId);
    for (const body of [
      {},
      { giaMacDinh: null },
      { nhomDichVuId: null },
      { mucDatCoc: '0' },
    ])
      expectErrorResponse(await patch(id, body), 400, 'DU_LIEU_KHONG_HOP_LE');
    for (const badId of ['0', '-1', 'abc', '9223372036854775808']) {
      expectErrorResponse(await getOne(badId), 400, 'DU_LIEU_KHONG_HOP_LE');
      expectErrorResponse(
        await patch(badId, { ten: 'Sửa' }),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
    }
    expectErrorResponse(await getOne('999999'), 404, 'KHONG_TIM_THAY');
  });

  it('DV-15/20: tên trùng cùng nhóm trả409; trùng nhóm khác được phép', async () => {
    await post({
      nhomDichVuId: groupId,
      ten: 'Khám tổng quát',
      thoiLuong: 30,
      giaMacDinh: '100.00',
    }).expect(201);
    expectErrorResponse(
      await post({
        nhomDichVuId: groupId,
        ten: ' KHAM  TONG QUAT ',
        thoiLuong: 30,
        giaMacDinh: '100.00',
      }),
      409,
      'TEN_DICH_VU_TRUNG',
    );
    const other = await new AdminFixtures(db).catalog();
    await post({
      nhomDichVuId: other.group.nhomDichVuId,
      ten: 'Kham tong quat',
      thoiLuong: 30,
      giaMacDinh: '100.00',
    }).expect(201);
    const results = await Promise.all([
      post({
        nhomDichVuId: groupId,
        ten: 'Race',
        thoiLuong: 30,
        giaMacDinh: '1.00',
      }),
      post({
        nhomDichVuId: groupId,
        ten: 'Race',
        thoiLuong: 30,
        giaMacDinh: '1.00',
      }),
    ]);
    expect(
      results.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    expectErrorResponse(
      results.find((response) => response.status === 409)!,
      409,
      'TEN_DICH_VU_TRUNG',
    );
  });

  it('DV-16: Branch admin xem chung danh mục nhưng không được POST/PATCH', async () => {
    const created = await post({
      nhomDichVuId: groupId,
      ten: 'Danh mục chung',
      thoiLuong: 30,
      giaMacDinh: '100.00',
    }).expect(201);
    const id = String(created.body.dichVuKhamId);
    expect((await get(branchToken).expect(200)).body).toEqual(
      (await get().expect(200)).body,
    );
    expect((await getOne(id, branchToken).expect(200)).body).toEqual(
      created.body,
    );
    expectErrorResponse(
      await post(
        {
          nhomDichVuId: groupId,
          ten: 'Không ghi',
          thoiLuong: 30,
          giaMacDinh: '100.00',
        },
        branchToken,
      ),
      403,
      'KHONG_DU_QUYEN',
    );
    expectErrorResponse(
      await patch(id, { ten: 'Không ghi' }, branchToken),
      403,
      'KHONG_DU_QUYEN',
    );
    expect((await getOne(id)).body).toMatchObject({ ten: 'Danh mục chung' });
  });

  it('DV-16/PQ: guard thật cho mọi route, role sai và phiên thu hồi', async () => {
    const routes = [
      ['get', base],
      ['get', `${base}/1`],
      ['post', base],
      ['patch', `${base}/1`],
    ] as const;
    for (const [method, path] of routes)
      expectErrorResponse(
        await request(app.getHttpServer())[method](path),
        401,
        'CHUA_DANG_NHAP',
      );
    const patient = await insertTaiKhoan(db, {
      loaiTaiKhoan: 'BenhNhan',
      daXacMinhEmail: true,
    });
    const patientToken = (await sessions.create(patient.taiKhoanId))
      .accessToken;
    for (const [method, path] of routes)
      expectErrorResponse(
        await request(app.getHttpServer())
          [method](path)
          .auth(patientToken, { type: 'bearer' }),
        403,
        'KHONG_DU_QUYEN',
      );
    await sessions.revokeAll(systemId);
    for (const [method, path] of routes)
      expectErrorResponse(
        await request(app.getHttpServer())
          [method](path)
          .auth(systemToken, { type: 'bearer' }),
        401,
        'PHIEN_HET_HIEU_LUC',
      );
  });

  it('DV-07/16: paging/query escape qua HTTP', async () => {
    await post({
      nhomDichVuId: groupId,
      ten: 'B',
      thoiLuong: 30,
      giaMacDinh: '10.00',
    });
    await post({
      nhomDichVuId: groupId,
      ten: 'A',
      thoiLuong: 30,
      giaMacDinh: '10.00',
    });
    await post({
      nhomDichVuId: groupId,
      ten: 'C 50%_!',
      thoiLuong: 30,
      giaMacDinh: '10.00',
    });
    expect(
      (await get().query({ page: 2, pageSize: 1 }).expect(200)).body,
    ).toMatchObject({ page: 2, pageSize: 1, items: [{ ten: 'B' }] });
    expect((await get().query({ q: ' % ' }).expect(200)).body).toMatchObject({
      total: 1,
      items: [{ ten: 'C 50%_!' }],
    });
  });
});
