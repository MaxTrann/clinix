import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ChuyenKhoa } from '../src/admin/entities/chuyen-khoa.entity.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { SearchFixtures } from '../src/search/testing/search-fixtures.js';

describe('B2 — GET /public/specialties (HTTP, AppModule, MySQL thật)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fixtures: SearchFixtures;
  let patientToken: string;
  let branchId: string;
  let activeId: string;
  let stoppedId: string;

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
    const repo = db.getRepository(ChuyenKhoa);
    const active = await repo.save(
      repo.create({ ten: 'Tim mạch', moTa: 'Khám tim' }),
    );
    const stopped = await repo.save(
      repo.create({ ten: 'Da liễu', trangThaiHoatDong: 'NgungHoatDong' }),
    );
    activeId = active.chuyenKhoaId;
    stoppedId = stopped.chuyenKhoaId;
    const branch = await fixtures.branchWithCoordinates();
    branchId = branch.chiNhanhId;
    await fixtures.publicDoctor(branch, { chuyenKhoaId: activeId });
    // AdminFixtures.doctor() tự tạo thêm một chuyên khoa mẫu; xoá để danh sách chỉ còn dữ liệu của test.
    await fixtures.pruneUnusedFixtureSpecialties();
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

  it('CC-01 + TCK-01: danh sách không token ⇒ 200, chỉ chuyên khoa đang hoạt động, có soCoBacSi', async () => {
    const { body } = await get('/public/specialties').expect(200);
    expect(body).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 20,
      soCoBacSi: 1,
    });
    expect(body.items).toEqual([
      {
        chuyenKhoaId: activeId,
        ten: 'Tim mạch',
        moTa: 'Khám tim',
        anhDaiDien: null,
        soBacSi: 1,
      },
    ]);
  });

  it('TCK-04: chiNhanhId lọc đúng; chi nhánh không tồn tại ⇒ 200 rỗng', async () => {
    const hit = await get(`/public/specialties?chiNhanhId=${branchId}`).expect(
      200,
    );
    expect(hit.body.items).toHaveLength(1);
    const none = await get('/public/specialties?chiNhanhId=999999').expect(200);
    expect(none.body).toMatchObject({ items: [], total: 0, soCoBacSi: 0 });
  });

  it('TCK-08: chiNhanhId=abc ⇒ 400 BO_LOC_KHONG_HOP_LE kèm loi[chiNhanhId]', async () => {
    const response = await get('/public/specialties?chiNhanhId=abc');
    expectErrorResponse(response, 400, 'BO_LOC_KHONG_HOP_LE');
    expect(response.body.loi).toEqual([
      { truong: 'chiNhanhId', ma: 'ID_LOC_KHONG_HOP_LE' },
    ]);
  });

  it('TCK-05 + BMS: q 101 ký tự ⇒ 400 TU_KHOA_KHONG_HOP_LE; pageSize 101 ⇒ 400; q khớp ⇒ 200', async () => {
    const bad = await get(`/public/specialties?q=${'a'.repeat(101)}`);
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toContain('TU_KHOA_KHONG_HOP_LE');
    await get('/public/specialties?pageSize=101').expect(400);
    const hit = await get('/public/specialties?q=tim').expect(200);
    expect(hit.body.items).toHaveLength(1);
  });

  it('TCK-06/07: chi tiết đang hoạt động ⇒ 200 đúng sáu trường, giaKhamTu = giá áp dụng thấp nhất + cọc', async () => {
    await db.query(
      `UPDATE dich_vu_kham SET gia_mac_dinh = '300000.00', muc_dat_coc = '50000.00'
       WHERE dich_vu_kham_id IN (SELECT dich_vu_kham_id FROM bac_si WHERE chuyen_khoa_id = ?)`,
      [activeId],
    );
    const { body } = await get(`/public/specialties/${activeId}`).expect(200);
    expect(body).toEqual({
      chuyenKhoaId: activeId,
      ten: 'Tim mạch',
      moTa: 'Khám tim',
      anhDaiDien: null,
      soBacSi: 1,
      giaKhamTu: { giaKham: '300000.00', mucDatCoc: '50000.00' },
    });
    // Lọc chi nhánh không có bác sĩ ⇒ giaKhamTu null (TCK-07).
    const other = await get(
      `/public/specialties/${activeId}?chiNhanhId=999999`,
    ).expect(200);
    expect(other.body.giaKhamTu).toBeNull();
  });

  it('TCK-06: ngừng / không có / sai dạng ⇒ 404 KHONG_TIM_THAY cùng thân', async () => {
    const bodies: unknown[] = [];
    for (const id of [stoppedId, '999999', 'abc', '-1', '0']) {
      const response = await get(`/public/specialties/${id}`);
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
    const anonymous = (await get('/public/specialties').expect(200))
      .body as unknown;
    expect(
      (await get('/public/specialties', patientToken).expect(200)).body,
    ).toEqual(anonymous);
    expect(
      (await get('/public/specialties', 'khong-phai-jwt').expect(200)).body,
    ).toEqual(anonymous);
  });

  it('CC-05: POST/PUT/PATCH/DELETE ⇒ 404 KHONG_TIM_THAY', async () => {
    const server = app.getHttpServer();
    const calls = [
      () => request(server).post('/public/specialties').send({}),
      () => request(server).put(`/public/specialties/${activeId}`).send({}),
      () => request(server).patch(`/public/specialties/${activeId}`).send({}),
      () => request(server).delete(`/public/specialties/${activeId}`),
    ];
    for (const call of calls) {
      expectErrorResponse(await call(), 404, 'KHONG_TIM_THAY');
    }
  });

  it('CC-06: tham số lạ ⇒ 400 TRUONG_KHONG_DUOC_PHEP (cả danh sách và chi tiết)', async () => {
    for (const path of [
      '/public/specialties?trangThai=NgungHoatDong',
      `/public/specialties/${activeId}?trangThai=NgungHoatDong`,
    ]) {
      const response = await get(path);
      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain('TRUONG_KHONG_DUOC_PHEP');
    }
  });

  it('AN: không lộ khoá nhạy cảm (trạng thái, id ảnh, thông tin bác sĩ)', async () => {
    const list = JSON.stringify(
      (await get('/public/specialties').expect(200)).body,
    );
    const detail = JSON.stringify(
      (await get(`/public/specialties/${activeId}`).expect(200)).body,
    );
    for (const text of [list, detail]) {
      for (const key of [
        'trangThaiHoatDong',
        'anhTaiLenId',
        'email',
        'soDienThoai',
        'matKhau',
      ]) {
        expect(text).not.toContain(`"${key}"`);
      }
    }
  });
});
