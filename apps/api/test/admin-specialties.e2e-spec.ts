import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ModulesContainer } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AdminFixtures } from '../src/admin/testing/admin-fixtures.js';
import { ChuyenKhoa } from '../src/admin/entities/chuyen-khoa.entity.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { insertTaiKhoan } from '../src/auth/entities/testing/auth-fixtures.js';
import { UploadRepository } from '../src/common/upload/upload.repository.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { auditAdminControllers } from '../src/rbac/testing/admin-route-audit.js';

describe('B1 CK — HTTP AppModule + auth/C1/MySQL thật', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fixtures: AdminFixtures;
  let sessions: SessionService;
  let images: UploadRepository;
  let systemId: string;
  let systemToken: string;
  let branchToken: string;
  const base = '/admin/specialties';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    fixtures = new AdminFixtures(db);
    sessions = app.get(SessionService);
    images = app.get(UploadRepository);
  });
  beforeEach(async () => {
    await resetTables(db);
    const branch = await fixtures.branch();
    systemId = (await fixtures.admin()).account.taiKhoanId;
    systemToken = (await sessions.create(systemId)).accessToken;
    branchToken = (
      await sessions.create((await fixtures.admin(branch)).account.taiKhoanId)
    ).accessToken;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => app?.close());
  const get = (path: string, token = systemToken) =>
    request(app.getHttpServer()).get(path).auth(token, { type: 'bearer' });
  const post = (body: object, token = systemToken) =>
    request(app.getHttpServer())
      .post(base)
      .auth(token, { type: 'bearer' })
      .send(body);
  const patch = (path: string, body: object, token = systemToken) =>
    request(app.getHttpServer())
      .patch(path)
      .auth(token, { type: 'bearer' })
      .send(body);
  async function pendingImage() {
    const id = randomUUID();
    const now = new Date();
    await images.createPending(
      id,
      `test/b1/${id}`,
      systemId,
      now,
      new Date(now.getTime() + 86400000),
    );
    await images.confirm(id, `https://example.test/${id}.webp`, now);
    return id;
  }

  it('PQ-11: mọi route B1 có role/scope và không public', () => {
    const controllers = [...app.get(ModulesContainer).values()].flatMap(
      (module) =>
        [...module.controllers.values()].flatMap((wrapper) =>
          wrapper.metatype ? [wrapper.metatype] : [],
        ),
    );
    expect(controllers.map((controller) => controller.name)).toContain(
      'SpecialtyController',
    );
    expect(controllers.map((controller) => controller.name)).toContain(
      'SpecialtyOptionsController',
    );
    expect(auditAdminControllers(controllers)).toEqual([]);
  });

  it('CK-01/05/08/09: create/get/update/status và response allowlist', async () => {
    const created = await post({ ten: '  Tim\t mạch  ', moTa: 'Mô tả' }).expect(
      201,
    );
    expect(created.body).toEqual({
      chuyenKhoaId: expect.any(String),
      ten: 'Tim mạch',
      moTa: 'Mô tả',
      anhDaiDien: null,
      trangThaiHoatDong: 'DangHoatDong',
      soBacSi: 0,
    });
    const path = `${base}/${created.body.chuyenKhoaId}`;
    expect((await get(path).expect(200)).body).toEqual(created.body);
    expect(
      (await patch(path, { ten: 'Tim mạch', moTa: '' }).expect(200)).body.moTa,
    ).toBeNull();
    for (const trangThaiHoatDong of [
      'NgungHoatDong',
      'NgungHoatDong',
      'DangHoatDong',
    ])
      expect(
        (await patch(`${path}/status`, { trangThaiHoatDong }).expect(200)).body
          .trangThaiHoatDong,
      ).toBe(trangThaiHoatDong);
  });

  it('CK-02/12/17: validation thật, trường lạ/null/PATCH rỗng, q/paging/id/status', async () => {
    const row = await post({ ten: 'Mẫu' }).expect(201);
    const path = `${base}/${row.body.chuyenKhoaId}`;
    for (const input of [
      { ten: '' },
      { ten: '  ' },
      { ten: 'a'.repeat(101) },
      { ten: null },
      { ten: 'Tên', moTa: 'a'.repeat(5001) },
      { ten: 'Tên', anhDaiDien: 'https://example.test/x' },
      { ten: 'Tên', trangThaiHoatDong: 'NgungHoatDong' },
    ])
      expectErrorResponse(await post(input), 400, 'DU_LIEU_KHONG_HOP_LE');
    for (const input of [
      {},
      { ten: null },
      { trangThaiHoatDong: 'NgungHoatDong' },
      { accountId: systemId },
      { imageUploadId: 'bad' },
    ])
      expectErrorResponse(
        await patch(path, input),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
    for (const query of [
      { page: '0' },
      { page: '1.5' },
      { page: '1e20' },
      { pageSize: '101' },
      { q: 'q'.repeat(201) },
      { trangThaiHoatDong: 'bad' },
      { chiNhanhId: '1' },
    ])
      expectErrorResponse(
        await get(base).query(query),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
    for (const id of ['0', '-1', 'abc', '9223372036854775808'])
      expectErrorResponse(
        await get(`${base}/${id}`),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
    expectErrorResponse(
      await patch(`${path}/status`, {}),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expectErrorResponse(
      await patch(`${path}/status`, { trangThaiHoatDong: null }),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect((await get(base).expect(200)).body.total).toBe(1);
  });

  it('CK-03/04/06/10: lỗi trùng 409 không 500; race HTTP và giữ dữ liệu cũ', async () => {
    await post({ ten: 'Tim mạch' }).expect(201);
    expectErrorResponse(
      await post({ ten: '  TIM  MACH ' }),
      409,
      'TEN_CHUYEN_KHOA_TRUNG',
    );
    const row = await post({ ten: 'Nội', moTa: 'Giữ' }).expect(201);
    const path = `${base}/${row.body.chuyenKhoaId}`;
    expectErrorResponse(
      await patch(path, { ten: 'Tim mach', moTa: 'Không lưu' }),
      409,
      'TEN_CHUYEN_KHOA_TRUNG',
    );
    expect((await get(path).expect(200)).body).toMatchObject({
      ten: 'Nội',
      moTa: 'Giữ',
    });
    const results = await Promise.all([
      post({ ten: 'Cùng tên' }),
      post({ ten: 'Cùng tên' }),
    ]);
    expect(
      results.map((result) => result.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    expectErrorResponse(
      results.find((result) => result.status === 409)!,
      409,
      'TEN_CHUYEN_KHOA_TRUNG',
    );
  });

  it('CK-13: Chi nhánh GET list/detail/options được, mọi mutation 403 không ghi DB', async () => {
    const row = await post({ ten: 'Danh mục chung' }).expect(201);
    const path = `${base}/${row.body.chuyenKhoaId}`;
    for (const endpoint of [base, path, '/admin/options/specialties'])
      await get(endpoint, branchToken).expect(200);
    expectErrorResponse(
      await post({ ten: 'Không ghi' }, branchToken),
      403,
      'KHONG_DU_QUYEN',
    );
    expectErrorResponse(
      await patch(path, { ten: 'Không ghi' }, branchToken),
      403,
      'KHONG_DU_QUYEN',
    );
    expectErrorResponse(
      await patch(
        `${path}/status`,
        { trangThaiHoatDong: 'NgungHoatDong' },
        branchToken,
      ),
      403,
      'KHONG_DU_QUYEN',
    );
    expect(await db.getRepository(ChuyenKhoa).count()).toBe(1);
    expect((await get(path)).body.ten).toBe('Danh mục chung');
  });

  it('CK-13/PQ-01/02/12: chưa đăng nhập/sai role/phiên thu hồi bị chặn trên tất cả route', async () => {
    const routes = [
      ['get', base],
      ['get', `${base}/1`],
      ['get', '/admin/options/specialties'],
      ['post', base],
      ['patch', `${base}/1`],
      ['patch', `${base}/1/status`],
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
    expectErrorResponse(await get(base), 401, 'PHIEN_HET_HIEU_LUC');
  });

  it('CK-16/17: dropdown chỉ hoạt động, list/default/filter/query tên và mô tả/total', async () => {
    const a = await post({ ten: 'A', moTa: 'Chuỗi 50%_! mẫu' }).expect(201);
    const b = await post({ ten: 'B', moTa: 'Chuỗi 50xx mẫu' }).expect(201);
    await patch(`${base}/${b.body.chuyenKhoaId}/status`, {
      trangThaiHoatDong: 'NgungHoatDong',
    }).expect(200);
    expect(
      (await get(base).query({ pageSize: 1, page: 2 }).expect(200)).body,
    ).toMatchObject({ total: 2, page: 2, pageSize: 1, items: [{ ten: 'B' }] });
    expect(
      (
        await get(base)
          .query({ trangThaiHoatDong: 'NgungHoatDong' })
          .expect(200)
      ).body.items,
    ).toHaveLength(1);
    expect(
      (await get(base).query({ q: '%' }).expect(200)).body.items.map(
        (row: { ten: string }) => row.ten,
      ),
    ).toEqual(['A']);
    expect(
      (await get('/admin/options/specialties', branchToken).expect(200)).body,
    ).toEqual({
      items: [{ chuyenKhoaId: a.body.chuyenKhoaId, ten: 'A' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(
      (await get(base).query({ page: 999 }).expect(200)).body,
    ).toMatchObject({ items: [], total: 2 });
  });

  it('CK-11/14: ảnh được gắn qua account phiên, bỏ trường giữ/null gỡ, sai chủ không lưu tên', async () => {
    const id = await pendingImage();
    const row = await post({ ten: 'Ảnh', imageUploadId: id }).expect(201);
    const path = `${base}/${row.body.chuyenKhoaId}`;
    expect(row.body.anhDaiDien).toBe(`https://example.test/${id}.webp`);
    expect(
      (await patch(path, { moTa: 'Giữ ảnh' }).expect(200)).body.anhDaiDien,
    ).toBe(row.body.anhDaiDien);
    const another = await fixtures.admin();
    const otherToken = (await sessions.create(another.account.taiKhoanId))
      .accessToken;
    const next = await pendingImage();
    expectErrorResponse(
      await patch(path, { ten: 'Không lưu', imageUploadId: next }, otherToken),
      400,
      'ANH_TAI_LEN_KHONG_HOP_LE',
    );
    expect((await get(path)).body.ten).toBe('Ảnh');
    expect(
      (await patch(path, { imageUploadId: null }).expect(200)).body.anhDaiDien,
    ).toBeNull();
  });

  it('CK-14: 500 giữa ghi ảnh rollback cả chuyên khoa/ledger, response không lộ lỗi DB', async () => {
    const id = await pendingImage();
    const assign = images.assignSpecialty.bind(images);
    vi.spyOn(images, 'assignSpecialty').mockImplementation(async (...args) => {
      await assign(...args);
      throw new Error('B1 injected DB failure');
    });
    expectErrorResponse(
      await post({ ten: 'Rollback', imageUploadId: id }),
      500,
      'LOI_HE_THONG',
    );
    expect(await db.getRepository(ChuyenKhoa).count()).toBe(0);
    const rows: { trang_thai: string }[] = await db.query(
      'SELECT trang_thai FROM anh_tai_len WHERE anh_tai_len_id=?',
      [id],
    );
    expect(rows[0]!.trang_thai).toBe('ChuaGan');
  });

  it('CK-13/14: 404 thống nhất cho id không tồn tại qua GET/PATCH/status', async () => {
    const responses = [
      await get(`${base}/999`),
      await patch(`${base}/999`, { ten: 'X' }),
      await patch(`${base}/999/status`, { trangThaiHoatDong: 'DangHoatDong' }),
    ];
    for (const response of responses)
      expectErrorResponse(response, 404, 'KHONG_TIM_THAY');
    expect(responses[0]!.body).toEqual(responses[1]!.body);
    expect(responses[1]!.body).toEqual(responses[2]!.body);
  });
});
