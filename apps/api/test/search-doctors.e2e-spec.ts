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

describe('B5 — GET /public/doctors (HTTP, AppModule, MySQL thật)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fixtures: SearchFixtures;
  let patientToken: string;
  let branchId: string;
  let visibleId: string;

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
    branchId = branch.chiNhanhId;
    const visible = await fixtures.publicDoctor(
      branch,
      { chucDanh: 'BS_CKII', soNamKinhNghiem: 12 },
      { hoTen: 'Nguyễn Văn Hùng', email: 'hung.doctor@example.com' },
    );
    visibleId = visible.account.taiKhoanId;
    await fixtures.pendingDoctor(branch);
    await fixtures.suspendedDoctor(branch);
    await fixtures.surchargeRule('BS_CKII', 5, '150000.00');
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

  it('CC-01 + TBS-09: không token ⇒ 200, chỉ bác sĩ công khai, không lộ email/SĐT/trạng thái', async () => {
    const { body } = await get('/public/doctors').expect(200);
    expect(body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    const [item] = body.items;
    expect(item).toMatchObject({
      bacSiId: visibleId,
      hoTen: 'Nguyễn Văn Hùng',
      chucDanh: 'BS_CKII',
      soNamKinhNghiem: 12,
      chiNhanh: { chiNhanhId: branchId },
      danhGia: { diemTrungBinh: null, soDanhGia: 0 },
    });
    expect(item.gia.phuPhi).toBe('150000.00');
    const text = JSON.stringify(body);
    for (const leaked of [
      'hung.doctor@example.com',
      'email',
      'soDienThoai',
      'matKhau',
      'trangThai',
      'hocVi',
    ]) {
      expect(text).not.toContain(leaked);
    }
  });

  it('CC-02/03: token bệnh nhân hợp lệ hay sai chữ ký đều cho cùng thân phản hồi', async () => {
    const anonymous = await get('/public/doctors').expect(200);
    const withToken = await get('/public/doctors', patientToken).expect(200);
    const badToken = await get('/public/doctors', 'khong.phai.token').expect(
      200,
    );
    expect(withToken.body).toEqual(anonymous.body);
    expect(badToken.body).toEqual(anonymous.body);
  });

  it('TBS-04, TBS-10, TBS-15: lọc theo chi nhánh; id không tồn tại ⇒ 200 rỗng, không 404', async () => {
    const hit = await get(`/public/doctors?chiNhanhId=${branchId}`).expect(200);
    expect(hit.body.total).toBe(1);
    const miss = await get('/public/doctors?chiNhanhId=999999').expect(200);
    expect(miss.body).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('TBS-06/07/15, BMS-03: bộ lọc sai ⇒ 400 BO_LOC_KHONG_HOP_LE kèm loi[]', async () => {
    const cases: [string, string][] = [
      ['giaTu=-1', 'giaTu'],
      ['giaTu=100.5', 'giaTu'],
      ['giaTu=300&giaDen=200', 'giaTu'],
      ['diemTu=0', 'diemTu'],
      ['diemTu=5.1', 'diemTu'],
      ['sapXep=rating', 'sapXep'],
      ["sapXep=x'; DROP TABLE tai_khoan;--", 'sapXep'],
      ['chiNhanhId=abc', 'chiNhanhId'],
    ];
    for (const [qs, field] of cases) {
      const response = await get(
        `/public/doctors?${encodeURI(qs).replace(/'/g, '%27')}`,
      );
      expectErrorResponse(response, 400, 'BO_LOC_KHONG_HOP_LE');
      expect(JSON.stringify(response.body.loi)).toContain(field);
    }
  });

  it('tham số lạ ⇒ 400; q quá 100 ký tự ⇒ 400 TU_KHOA_KHONG_HOP_LE', async () => {
    await get('/public/doctors?khongCo=1').expect(400);
    const response = await get(`/public/doctors?q=${'a'.repeat(101)}`);
    expect(response.status).toBe(400);
  });

  it('TBS-05: q khớp họ tên không dấu', async () => {
    const hit = await get('/public/doctors?q=hung').expect(200);
    expect(hit.body.total).toBe(1);
    const miss = await get('/public/doctors?q=khongco').expect(200);
    expect(miss.body.total).toBe(0);
  });

  it('CC-07: gọi nhiều lần không làm đổi dữ liệu', async () => {
    const count = async () =>
      (await db.query<{ n: string }[]>('SELECT COUNT(*) AS n FROM bac_si'))[0]
        ?.n;
    const before = await count();
    await get('/public/doctors?sapXep=giaTangDan').expect(200);
    expect(await count()).toBe(before);
  });
});
