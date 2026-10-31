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
import { ServiceGroupRepository } from '../src/admin/service-groups/service-group.repository.js';

describe('B2 DV — HTTP AppModule/auth/C1/MySQL thật', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let sessions: SessionService;
  let systemId: string;
  let systemToken: string;
  let branchToken: string;
  const base = '/admin/service-groups';
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
    const fixtures = new AdminFixtures(db),
      branch = await fixtures.branch();
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

  it('DV-01/04/05: CRUD, allowlist response, mặc định0, DELETE204 không body', async () => {
    const created = await post({ ten: ' Khám\t tổng quát ' }).expect(201);
    const id = String(created.body.nhomDichVuId);
    expect(created.body).toEqual({
      nhomDichVuId: expect.any(String),
      ten: 'Khám tổng quát',
      thuTuHienThi: 0,
    });
    expect(
      (await patch(id, { thuTuHienThi: 3 }).expect(200)).body,
    ).toMatchObject({ ten: 'Khám tổng quát', thuTuHienThi: 3 });
    expect(
      (await patch(id, { ten: 'Nhóm sửa' }).expect(200)).body,
    ).toMatchObject({ ten: 'Nhóm sửa', thuTuHienThi: 3 });
    expect((await get().expect(200)).body).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect((await remove(id).expect(204)).text).toBe('');
    expectErrorResponse(await remove(id), 404, 'KHONG_TIM_THAY');
  });
  it('DV-02/04: validation thật tên/thứ tự/null/trường lạ/PATCH rỗng/ID/paging', async () => {
    const row = await post({ ten: 'Mẫu' }).expect(201),
      id = String(row.body.nhomDichVuId);
    for (const input of [
      {},
      { ten: null },
      { ten: ' ' },
      { ten: 'a'.repeat(101) },
      { ten: 'Mẫu', thuTuHienThi: null },
      { ten: 'Mẫu', thuTuHienThi: '1' },
      { ten: 'Mẫu', thuTuHienThi: -1 },
      { ten: 'Mẫu', thuTuHienThi: 1.5 },
      { ten: 'Mẫu', thuTuHienThi: 2147483648 },
      { ten: 'Mẫu', trangThaiHoatDong: 'DangHoatDong' },
    ])
      expectErrorResponse(await post(input), 400, 'DU_LIEU_KHONG_HOP_LE');
    for (const input of [
      {},
      { ten: null },
      { thuTuHienThi: null },
      { thuTuHienThi: '0' },
      { nhomDichVuId: '2' },
    ])
      expectErrorResponse(await patch(id, input), 400, 'DU_LIEU_KHONG_HOP_LE');
    for (const badId of ['0', '-1', 'abc', '9223372036854775808']) {
      expectErrorResponse(
        await patch(badId, { ten: 'X' }),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
      expectErrorResponse(await remove(badId), 400, 'DU_LIEU_KHONG_HOP_LE');
    }
    for (const query of [
      { page: 0 },
      { page: '1e20' },
      { pageSize: 101 },
      { q: 'q'.repeat(201) },
      { chiNhanhId: '1' },
    ])
      expectErrorResponse(
        await get().query(query),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
  });
  it('DV-03/04: duplicate HTTP/race trả409 và giữ thứ tự cũ', async () => {
    await post({ ten: 'Khám tổng quát' }).expect(201);
    expectErrorResponse(
      await post({ ten: ' KHAM  TONG QUAT ' }),
      409,
      'TEN_NHOM_DICH_VU_TRUNG',
    );
    const row = await post({ ten: 'B', thuTuHienThi: 5 }).expect(201);
    expectErrorResponse(
      await patch(String(row.body.nhomDichVuId), {
        ten: 'Kham tong quat',
        thuTuHienThi: 9,
      }),
      409,
      'TEN_NHOM_DICH_VU_TRUNG',
    );
    const items = (await get()).body.items as {
      ten: string;
      thuTuHienThi: number;
    }[];
    expect(items.find((x) => x.ten === 'B')!.thuTuHienThi).toBe(5);
    const results = await Promise.all([
      post({ ten: 'Race' }),
      post({ ten: 'Race' }),
    ]);
    expect(results.map((x) => x.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    expectErrorResponse(
      results.find((x) => x.status === 409)!,
      409,
      'TEN_NHOM_DICH_VU_TRUNG',
    );
  });
  it('DV-06: nhóm còn dịch vụ 409 và 404 đồng nhất PATCH/DELETE', async () => {
    const row = await post({ ten: 'Có dịch vụ' }).expect(201);
    await db.query(
      'INSERT INTO dich_vu_kham (nhom_dich_vu_id,ten,thoi_luong,gia_mac_dinh) VALUES (?, ?, 30,100)',
      [row.body.nhomDichVuId, 'Mẫu'],
    );
    expectErrorResponse(
      await remove(String(row.body.nhomDichVuId)),
      409,
      'NHOM_DICH_VU_CON_DICH_VU',
    );
    const a = await patch('999', { ten: 'X' }),
      b = await remove('999');
    expectErrorResponse(a, 404, 'KHONG_TIM_THAY');
    expectErrorResponse(b, 404, 'KHONG_TIM_THAY');
    expect(a.body).toEqual(b.body);
    expect((await get()).body.total).toBe(1);
  });
  it('DV-16: Chi nhánh đọc danh mục chung nhưng mọi ghi 403 không đổi DB', async () => {
    const row = await post({ ten: 'Danh mục chung' }).expect(201),
      id = String(row.body.nhomDichVuId);
    expect((await get(branchToken).expect(200)).body).toEqual(
      (await get()).body,
    );
    expectErrorResponse(
      await post({ ten: 'Không ghi' }, branchToken),
      403,
      'KHONG_DU_QUYEN',
    );
    expectErrorResponse(
      await patch(id, { ten: 'Không ghi' }, branchToken),
      403,
      'KHONG_DU_QUYEN',
    );
    expectErrorResponse(await remove(id, branchToken), 403, 'KHONG_DU_QUYEN');
    expect((await get()).body.items).toMatchObject([{ ten: 'Danh mục chung' }]);
  });
  it('DV-16/PQ: mọi route chặn thiếu token, sai3 role và phiên thu hồi', async () => {
    const routes = [
      ['get', base],
      ['post', base],
      ['patch', `${base}/1`],
      ['delete', `${base}/1`],
    ] as const;
    for (const [method, path] of routes)
      expectErrorResponse(
        await request(app.getHttpServer())[method](path),
        401,
        'CHUA_DANG_NHAP',
      );
    for (const role of ['BenhNhan', 'BacSi', 'LeTan'] as const) {
      const account = await insertTaiKhoan(db, {
        loaiTaiKhoan: role,
        daXacMinhEmail: true,
      });
      const token = (await sessions.create(account.taiKhoanId)).accessToken;
      for (const [method, path] of routes)
        expectErrorResponse(
          await request(app.getHttpServer())
            [method](path)
            .auth(token, { type: 'bearer' }),
          403,
          'KHONG_DU_QUYEN',
        );
    }
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
  it('DV-16: tìm kiếm/paging/sort/escape qua HTTP', async () => {
    await post({ ten: 'B', thuTuHienThi: 0 });
    await post({ ten: 'A', thuTuHienThi: 0 });
    await post({ ten: 'C 50%_!', thuTuHienThi: 1 });
    expect(
      (await get().query({ page: 2, pageSize: 1 }).expect(200)).body,
    ).toMatchObject({ total: 3, page: 2, pageSize: 1, items: [{ ten: 'B' }] });
    expect((await get().query({ q: ' % ' }).expect(200)).body).toMatchObject({
      total: 1,
      items: [{ ten: 'C 50%_!' }],
    });
  });
  it('DV-04/05: lỗi DB sau DELETE rollback, HTTP không lộ lỗi gốc', async () => {
    const row = await post({ ten: 'Giữ' }).expect(201);
    const repo = app.get(ServiceGroupRepository),
      original = repo.remove.bind(repo);
    vi.spyOn(repo, 'remove').mockImplementation(async (...args) => {
      await original(...args);
      throw new Error('B2 injected failure');
    });
    const response = await remove(String(row.body.nhomDichVuId));
    expectErrorResponse(response, 500, 'LOI_HE_THONG');
    expect(JSON.stringify(response.body)).not.toContain('B2 injected');
    expect((await get()).body.items).toEqual([row.body]);
  });
});
