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
import { DoctorFixtures } from '../src/doctor/testing/doctor-fixtures.js';

// Doctor B12 — GET /doctor/leave-requests và GET /doctor/leave-requests/:id qua HTTP thật + MySQL thật:
// YN-15 (chỉ của mình, mới nhất trước, lọc trạng thái, phân trang, 404 cùng thân), YN-16 (chi tiết, không lộ người xử lý),
// YN-13 (sai vai trò ⇒ 403/401 cho hai route đọc), YN-20 (vẫn không có route huỷ khi đã có GET :id).
describe('B12 — lịch sử và chi tiết yêu cầu nghỉ phép', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: DoctorFixtures;
  let sessions: SessionService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    fx = new DoctorFixtures(db);
    sessions = app.get(SessionService);
  });
  beforeEach(async () => {
    await resetTables(db);
  });
  afterAll(async () => app?.close());

  const tokenOf = async (accountId: string) =>
    (await sessions.create(accountId)).accessToken;
  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).auth(token, { type: 'bearer' });

  /** Hai bác sĩ cùng chi nhánh: A là người gọi, B để thử "của người khác". */
  async function setup() {
    const world = await fx.world();
    const other = await fx.admin.doctor(world.branch);
    const doctorId = world.doctor.account.taiKhoanId;
    return {
      ...world,
      doctorId,
      otherId: other.account.taiKhoanId,
      token: await tokenOf(doctorId),
    };
  }
  /** Đặt `thoi_diem_tao` rõ ràng để kiểm thứ tự (fixture mặc định cùng `NOW()`). */
  const setCreatedAt = (id: string, at: string) =>
    db.query(
      `UPDATE yeu_cau_nghi_phep SET thoi_diem_tao = ? WHERE yeu_cau_nghi_phep_id = ?`,
      [at, id],
    );

  it('YN-15 danh sách: chỉ của mình, mới nhất trước, đúng hình dạng và không có khoá thừa', async () => {
    const w = await setup();
    const oldest = await fx.leaveRequest({
      bacSiId: w.doctorId,
      batDau: '2026-12-01',
    });
    const newest = await fx.leaveRequest({
      bacSiId: w.doctorId,
      batDau: '2026-12-03',
      hinhThuc: 'TheoCa',
      ca: 'CaSang',
    });
    const middle = await fx.leaveRequest({
      bacSiId: w.doctorId,
      batDau: '2026-12-02',
    });
    await fx.leaveRequest({ bacSiId: w.otherId, batDau: '2026-12-05' });
    await setCreatedAt(oldest, '2026-11-01 08:00:00');
    await setCreatedAt(middle, '2026-11-02 08:00:00');
    await setCreatedAt(newest, '2026-11-03 08:00:00');

    const res = await get('/doctor/leave-requests', w.token).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(20);
    expect(
      res.body.items.map(
        (i: { yeuCauNghiPhepId: string }) => i.yeuCauNghiPhepId,
      ),
    ).toEqual([newest, middle, oldest]);
    // 08:00 giờ Việt Nam = 01:00 UTC.
    expect(res.body.items[0]).toEqual({
      yeuCauNghiPhepId: newest,
      trangThai: 'ChoDuyet',
      hinhThuc: 'TheoCa',
      tuNgay: '2026-12-03',
      denNgay: '2026-12-03',
      ca: 'CaSang',
      lyDo: 'Việc gia đình',
      thoiDiemTao: '2026-11-03T01:00:00.000Z',
      thoiDiemXuLy: null,
    });
  });

  it('YN-15 phân trang: trang 2 và total không đổi; yêu cầu cùng giây vẫn có thứ tự ổn định', async () => {
    const w = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1)
      ids.push(
        await fx.leaveRequest({ bacSiId: w.doctorId, batDau: '2026-12-01' }),
      );
    // Cùng `thoi_diem_tao` (NOW()): phá hoà bằng id giảm dần.
    const expected = [...ids].reverse();

    const page1 = await get(
      '/doctor/leave-requests?page=1&pageSize=2',
      w.token,
    );
    const page2 = await get(
      '/doctor/leave-requests?page=2&pageSize=2',
      w.token,
    );
    const page4 = await get(
      '/doctor/leave-requests?page=4&pageSize=2',
      w.token,
    );
    const idsOf = (res: { body: { items: { yeuCauNghiPhepId: string }[] } }) =>
      res.body.items.map((i) => i.yeuCauNghiPhepId);
    expect(idsOf(page1)).toEqual(expected.slice(0, 2));
    expect(idsOf(page2)).toEqual(expected.slice(2, 4));
    expect(page2.body.total).toBe(5);
    expect(page2.body.page).toBe(2);
    // Trang vượt quá: rỗng, total vẫn đúng.
    expect(page4.status).toBe(200);
    expect(page4.body.items).toEqual([]);
    expect(page4.body.total).toBe(5);
  });

  it('YN-15 lọc trangThai; giá trị lạ, page = 0, pageSize quá lớn ⇒ 400; bacSiId lạ ⇒ 400 TRUONG_KHONG_DUOC_PHEP', async () => {
    const w = await setup();
    await fx.leaveRequest({ bacSiId: w.doctorId, trangThai: 'ChoDuyet' });
    await fx.leaveRequest({
      bacSiId: w.doctorId,
      trangThai: 'DaDuyet',
      nguoiXuLyId: w.systemAdmin.account.taiKhoanId,
      thoiDiemXuLy: '2026-11-05 09:00:00',
    });
    await fx.leaveRequest({
      bacSiId: w.doctorId,
      trangThai: 'TuChoi',
      nguoiXuLyId: w.systemAdmin.account.taiKhoanId,
      thoiDiemXuLy: '2026-11-05 09:00:00',
    });

    for (const status of ['ChoDuyet', 'DaDuyet', 'TuChoi']) {
      const res = await get(
        `/doctor/leave-requests?trangThai=${status}`,
        w.token,
      ).expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].trangThai).toBe(status);
    }
    for (const bad of ['trangThai=DaHuy', 'page=0', 'pageSize=101', 'page=abc'])
      expectErrorResponse(
        await get(`/doctor/leave-requests?${bad}`, w.token),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
    const injected = expectErrorResponse(
      await get(`/doctor/leave-requests?bacSiId=${w.otherId}`, w.token),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(injected.loi).toContainEqual({
      truong: 'bacSiId',
      ma: 'TRUONG_KHONG_DUOC_PHEP',
    });
  });

  it('YN-15 bác sĩ chưa có yêu cầu nào ⇒ 200 danh sách rỗng', async () => {
    const w = await setup();
    await fx.leaveRequest({ bacSiId: w.otherId });
    const res = await get('/doctor/leave-requests', w.token).expect(200);
    expect(res.body).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('YN-16 chi tiết: có trạng thái và thời điểm xử lý, không lộ id người xử lý hay bac_si_id', async () => {
    const w = await setup();
    const processed = await fx.leaveRequest({
      bacSiId: w.doctorId,
      batDau: '2026-12-01',
      ketThuc: '2026-12-03',
      trangThai: 'DaDuyet',
      nguoiXuLyId: w.systemAdmin.account.taiKhoanId,
      thoiDiemXuLy: '2026-11-05 09:00:00',
    });
    const pending = await fx.leaveRequest({
      bacSiId: w.doctorId,
      batDau: '2026-12-10',
      hinhThuc: 'TheoCa',
      ca: 'CaChieu',
    });

    const done = await get(
      `/doctor/leave-requests/${processed}`,
      w.token,
    ).expect(200);
    expect(done.headers['cache-control']).toBe('no-store');
    expect(Object.keys(done.body).sort()).toEqual(
      [
        'ca',
        'denNgay',
        'hinhThuc',
        'lyDo',
        // B17 (Q22, D14): chi tiết yêu cầu còn hiệu lực có số lịch hẹn đang có trong các ca bị phủ (ở đây không có ca nào ⇒ 0)
        'soLichHenDangCo',
        'thoiDiemTao',
        'thoiDiemXuLy',
        'trangThai',
        'tuNgay',
        'yeuCauNghiPhepId',
      ].sort(),
    );
    expect(done.body.soLichHenDangCo).toBe(0);
    expect(done.body).toMatchObject({
      yeuCauNghiPhepId: processed,
      trangThai: 'DaDuyet',
      hinhThuc: 'CaNgay',
      tuNgay: '2026-12-01',
      denNgay: '2026-12-03',
      ca: null,
      lyDo: 'Việc gia đình',
    });
    // 09:00 giờ Việt Nam = 02:00 UTC.
    expect(done.body.thoiDiemXuLy).toBe('2026-11-05T02:00:00.000Z');
    expect(done.body.thoiDiemTao).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    // Không có khoá `nguoiXuLyId`/`bacSiId` đã được ghim bởi danh sách khoá đầy đủ ở trên.
    expect(done.body).not.toHaveProperty('nguoiXuLyId');
    expect(done.body).not.toHaveProperty('bacSiId');

    const waiting = await get(
      `/doctor/leave-requests/${pending}`,
      w.token,
    ).expect(200);
    expect(waiting.body).toMatchObject({
      trangThai: 'ChoDuyet',
      hinhThuc: 'TheoCa',
      ca: 'CaChieu',
      thoiDiemXuLy: null,
    });
  });

  it('YN-15 chi tiết của người khác, id không có, id sai dạng ⇒ 404 KHONG_TIM_THAY cùng thân', async () => {
    const w = await setup();
    const theirs = await fx.leaveRequest({ bacSiId: w.otherId });
    const bodies = [];
    for (const id of [theirs, '999999', '0', 'abc', '1e3', '-1']) {
      const res = await get(`/doctor/leave-requests/${id}`, w.token);
      bodies.push(expectErrorResponse(res, 404, 'KHONG_TIM_THAY'));
    }
    // Cùng thân từng chữ: không phân biệt được "của người khác" với "không có".
    for (const body of bodies) expect(body).toEqual(bodies[0]);
  });

  it('YN-13 Lễ tân, Bệnh nhân, Quản trị viên ⇒ 403; chưa đăng nhập ⇒ 401 (cả hai route đọc)', async () => {
    const w = await setup();
    const id = await fx.leaveRequest({ bacSiId: w.doctorId });
    const patient = await fx.admin.patient();
    for (const accountId of [
      w.receptionist.account.taiKhoanId,
      patient.account.taiKhoanId,
      w.systemAdmin.account.taiKhoanId,
      w.branchAdmin.account.taiKhoanId,
    ])
      for (const path of [
        '/doctor/leave-requests',
        `/doctor/leave-requests/${id}`,
      ])
        expectErrorResponse(
          await get(path, await tokenOf(accountId)),
          403,
          'KHONG_DU_QUYEN',
        );
    for (const path of [
      '/doctor/leave-requests',
      `/doctor/leave-requests/${id}`,
    ])
      expectErrorResponse(
        await request(app.getHttpServer()).get(path),
        401,
        'CHUA_DANG_NHAP',
      );
  });

  it('YN-20 đã có GET :id nhưng vẫn không có route huỷ/sửa (Q23): DELETE, PATCH, PUT ⇒ 404', async () => {
    const w = await setup();
    const id = await fx.leaveRequest({ bacSiId: w.doctorId });
    for (const method of ['delete', 'patch', 'put'] as const) {
      expectErrorResponse(
        await request(app.getHttpServer())
          [method](`/doctor/leave-requests/${id}`)
          .auth(w.token, { type: 'bearer' }),
        404,
        'KHONG_TIM_THAY',
      );
    }
    expect(
      Number(
        (await db.query('SELECT COUNT(*) AS so FROM yeu_cau_nghi_phep'))[0].so,
      ),
    ).toBe(1);
  });
});
