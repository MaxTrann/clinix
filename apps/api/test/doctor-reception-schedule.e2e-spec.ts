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

// Doctor B8 — GET /reception/doctor-schedules/doctors và GET /reception/doctor-schedules qua HTTP thật + MySQL thật:
// XL-08…XL-14, XL-17, QH-03, QH-11.
describe('B8 — Lễ tân xem lịch làm việc bác sĩ', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: DoctorFixtures;
  let sessions: SessionService;
  const grid = '/reception/doctor-schedules';
  const doctors = '/reception/doctor-schedules/doctors';
  const MON = '2026-12-07'; // Thứ Hai
  const SUN = '2026-12-13';
  const week = { tuNgay: MON, denNgay: SUN };

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
  const get = (path: string, query: Record<string, string>, token: string) =>
    request(app.getHttpServer())
      .get(path)
      .query(query)
      .auth(token, { type: 'bearer' });
  const idsOf = (items: { bacSiId: string }[]) => items.map((i) => i.bacSiId);

  /**
   * Chi nhánh A (Lễ tân A) có Alpha; chi nhánh B (Lễ tân B) có Beta; Gamma có hồ sơ ở B nhưng từng có ca ở A;
   * Delta có hồ sơ ở A và ca ở cả hai chi nhánh.
   */
  async function setup() {
    const world = await fx.world();
    const branchB = await fx.admin.branch();
    await fx.admin.weeklySchedule(branchB.chiNhanhId);
    const receptionB = await fx.admin.receptionist(branchB);
    await db.query('UPDATE tai_khoan SET ho_ten = ? WHERE tai_khoan_id = ?', [
      'Nguyễn Alpha',
      world.doctor.account.taiKhoanId,
    ]);
    const alpha = world.doctor;
    const beta = await fx.admin.doctor(branchB, {}, { hoTen: 'Trần Beta' });
    const gamma = await fx.admin.doctor(branchB, {}, { hoTen: 'Lê Gamma' });
    const delta = await fx.admin.doctor(
      world.branch,
      {},
      { hoTen: 'Võ Delta' },
    );
    return {
      ...world,
      branchA: world.branch,
      branchB,
      receptionB,
      alpha,
      beta,
      gamma,
      delta,
      tokenA: await tokenOf(world.receptionist.account.taiKhoanId),
      tokenB: await tokenOf(receptionB.account.taiKhoanId),
    };
  }

  it('XL-10 danh sách bác sĩ: hồ sơ thuộc chi nhánh ∪ có ca (kể cả đã qua), không trùng lặp, không bác sĩ chi nhánh khác', async () => {
    const w = await setup();
    // Alpha vừa có hồ sơ vừa có ca ở A: vẫn chỉ một dòng. Gamma chỉ có ca CŨ ở A.
    await fx.admin.shift(w.alpha.profile, { ngay: MON, ca: 'CaSang' });
    await fx.admin.shift(w.gamma.profile, {
      ngay: '2020-01-06',
      ca: 'CaSang',
      chiNhanhId: w.branchA.chiNhanhId,
    });

    const res = await get(doctors, {}, w.tokenA).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({ total: 3, page: 1, pageSize: 20 });
    expect(res.body.items.map((i: { hoTen: string }) => i.hoTen)).toEqual([
      'Lê Gamma',
      'Nguyễn Alpha',
      'Võ Delta',
    ]);
    expect(idsOf(res.body.items)).not.toContain(w.beta.account.taiKhoanId);
    expect(res.body.items[1]).toMatchObject({
      bacSiId: w.alpha.account.taiKhoanId,
      ngungHoatDong: false,
      chiNhanh: { chiNhanhId: w.branchA.chiNhanhId },
    });
  });

  it('XL-17 phân trang; q khớp tên hoặc chuyên khoa; %, _, ! được escape (chỉ khớp đúng ký tự)', async () => {
    const w = await setup();
    const special = await fx.admin.doctor(
      w.branchA,
      {},
      { hoTen: 'Phạm 50%_Test!' },
    );
    const only = (q: string) => get(doctors, { q }, w.tokenA).expect(200);
    expect(idsOf((await only('%_')).body.items)).toEqual([
      special.account.taiKhoanId,
    ]);
    expect(idsOf((await only('_T')).body.items)).toEqual([
      special.account.taiKhoanId,
    ]);
    expect(idsOf((await only('Test!')).body.items)).toEqual([
      special.account.taiKhoanId,
    ]);
    expect(idsOf((await only('alpha')).body.items)).toEqual([
      w.alpha.account.taiKhoanId,
    ]);

    const page2 = await get(
      doctors,
      { page: '2', pageSize: '1' },
      w.tokenA,
    ).expect(200);
    expect(page2.body).toMatchObject({ total: 3, page: 2, pageSize: 1 });
    expect(page2.body.items).toHaveLength(1);
    const invalid: Record<string, string>[] = [
      { q: 'a' },
      { pageSize: '101' },
      { page: '0' },
    ];
    for (const query of invalid)
      expectErrorResponse(
        await get(doctors, query, w.tokenA),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
  });

  it('XL-08/QH-03 bác sĩ có ca ở hai chi nhánh: Lễ tân chỉ thấy ca mang chi nhánh của mình, ca kia bị lọc bỏ không báo lỗi', async () => {
    const w = await setup();
    await fx.admin.shift(w.delta.profile, { ngay: MON, ca: 'CaSang' }); // ở A
    await fx.admin.shift(w.delta.profile, {
      ngay: '2026-12-08',
      ca: 'CaSang',
      chiNhanhId: w.branchB.chiNhanhId,
    });

    const inA = await get(
      grid,
      { ...week, bacSiId: w.delta.account.taiKhoanId },
      w.tokenA,
    ).expect(200);
    expect(inA.body.items).toHaveLength(1);
    expect(inA.body.items[0].ca).toMatchObject([
      {
        ngay: MON,
        ca: 'CaSang',
        batDau: '08:00',
        ketThuc: '12:00',
        chiNhanh: { chiNhanhId: w.branchA.chiNhanhId },
      },
    ]);
    // Cả hai chi nhánh cùng thấy Delta nhưng mỗi nơi chỉ thấy ca của mình.
    const inB = await get(
      grid,
      { ...week, bacSiId: w.delta.account.taiKhoanId },
      w.tokenB,
    ).expect(200);
    expect(inB.body.items[0].ca.map((s: { ngay: string }) => s.ngay)).toEqual([
      '2026-12-08',
    ]);
  });

  it('XL-09/QH-03 bác sĩ đã chuyển chi nhánh: ca cũ ở chi nhánh Lễ tân vẫn thấy, ca ở chi nhánh mới thì không', async () => {
    const w = await setup();
    await fx.admin.shift(w.gamma.profile, {
      ngay: MON,
      ca: 'CaChieu',
      chiNhanhId: w.branchA.chiNhanhId,
    }); // ca cũ ở A
    await fx.admin.shift(w.gamma.profile, { ngay: '2026-12-08', ca: 'CaSang' }); // ca mới ở B (chi nhánh hiện tại)

    const inA = await get(
      grid,
      { ...week, bacSiId: w.gamma.account.taiKhoanId },
      w.tokenA,
    ).expect(200);
    expect(inA.body.items[0].ca).toHaveLength(1);
    expect(inA.body.items[0].ca[0]).toMatchObject({
      ngay: MON,
      ca: 'CaChieu',
      chiNhanh: { chiNhanhId: w.branchA.chiNhanhId },
    });
    const inB = await get(
      grid,
      { ...week, bacSiId: w.gamma.account.taiKhoanId },
      w.tokenB,
    ).expect(200);
    expect(inB.body.items[0].ca.map((s: { ngay: string }) => s.ngay)).toEqual([
      '2026-12-08',
    ]);
  });

  it('QH-11 hai Lễ tân hai chi nhánh: thấy khác nhau, đúng chi nhánh của mình', async () => {
    const w = await setup();
    await fx.admin.shift(w.alpha.profile, { ngay: MON, ca: 'CaSang' });
    await fx.admin.shift(w.beta.profile, { ngay: MON, ca: 'CaSang' });

    const a = await get(grid, week, w.tokenA).expect(200);
    const b = await get(grid, week, w.tokenB).expect(200);
    expect(idsOf(a.body.items)).toContain(w.alpha.account.taiKhoanId);
    expect(idsOf(a.body.items)).not.toContain(w.beta.account.taiKhoanId);
    expect(idsOf(b.body.items)).toContain(w.beta.account.taiKhoanId);
    expect(idsOf(b.body.items)).not.toContain(w.alpha.account.taiKhoanId);
    expect(a.body.total + b.body.total).toBe(
      a.body.items.length + b.body.items.length,
    );
  });

  it('XL-11 bacSiId ngoài phạm vi và không tồn tại ⇒ 403 KHONG_DU_QUYEN CÙNG thân; sai dạng ⇒ 404 KHONG_TIM_THAY', async () => {
    const w = await setup();
    const outside = expectErrorResponse(
      await get(
        grid,
        { ...week, bacSiId: w.beta.account.taiKhoanId },
        w.tokenA,
      ),
      403,
      'KHONG_DU_QUYEN',
    );
    const missing = expectErrorResponse(
      await get(grid, { ...week, bacSiId: '999999999' }, w.tokenA),
      403,
      'KHONG_DU_QUYEN',
    );
    expect(missing).toEqual(outside);
    for (const bad of ['abc', '0', '-1', '1.5', '9'.repeat(30)])
      expectErrorResponse(
        await get(grid, { ...week, bacSiId: bad }, w.tokenA),
        404,
        'KHONG_TIM_THAY',
      );
    // Guard chạy trước: người không có quyền nhận 401/403 dù id sai dạng, không biết id đúng dạng hay không.
    expectErrorResponse(
      await request(app.getHttpServer())
        .get(grid)
        .query({ ...week, bacSiId: 'abc' }),
      401,
      'CHUA_DANG_NHAP',
    );
    expectErrorResponse(
      await get(
        grid,
        { ...week, bacSiId: 'abc' },
        await tokenOf(w.systemAdmin.account.taiKhoanId),
      ),
      403,
      'KHONG_DU_QUYEN',
    );
  });

  it('XL-12 ngày nghỉ gắn trên ca nhìn thấy: ChoDuyet/DaDuyet hiện, TuChoi không; không có lý do nghỉ', async () => {
    const w = await setup();
    const id = w.alpha.account.taiKhoanId;
    const handled = {
      nguoiXuLyId: w.systemAdmin.account.taiKhoanId,
      thoiDiemXuLy: '2026-12-01 09:00:00',
    };
    for (const ngay of [MON, '2026-12-08', '2026-12-09'])
      await fx.admin.shift(w.alpha.profile, { ngay, ca: 'CaSang' });
    await fx.leaveRequest({
      bacSiId: id,
      batDau: MON,
      trangThai: 'DaDuyet',
      ...handled,
    });
    await fx.leaveRequest({ bacSiId: id, batDau: '2026-12-08' });
    await fx.leaveRequest({
      bacSiId: id,
      batDau: '2026-12-09',
      trangThai: 'TuChoi',
      ...handled,
    });

    const res = await get(grid, { ...week, bacSiId: id }, w.tokenA).expect(200);
    expect(
      res.body.items[0].ca.map(
        (s: { ngay: string; nghiPhep: string | null }) => [s.ngay, s.nghiPhep],
      ),
    ).toEqual([
      [MON, 'DaDuyet'],
      ['2026-12-08', 'ChoDuyet'],
      ['2026-12-09', null],
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/Việc gia đình|lyDo|ly_do/);
  });

  it('XL-13 Lễ tân không ghi/sửa được: mọi phương thức ngoài GET không có route', async () => {
    const w = await setup();
    const { shift } = await fx.shiftWithSlots(w.alpha.profile, {
      ngay: MON,
      ca: 'CaSang',
    });
    for (const method of ['post', 'put', 'patch', 'delete'] as const)
      for (const path of [grid, doctors, `${grid}/${shift.lichLamViecId}`]) {
        const res = await request(app.getHttpServer())
          [method](path)
          .auth(w.tokenA, { type: 'bearer' })
          .send({});
        expect([403, 404, 405], `${method} ${path}`).toContain(res.status);
      }
    // Cũng không gỡ được ca qua đường của Quản trị viên.
    expectErrorResponse(
      await request(app.getHttpServer())
        .delete(`/admin/doctor-shifts/${shift.lichLamViecId}`)
        .auth(w.tokenA, { type: 'bearer' }),
      403,
      'KHONG_DU_QUYEN',
    );
    expect(
      Number(
        (await db.query('SELECT COUNT(*) AS so FROM lich_lam_viec'))[0].so,
      ),
    ).toBe(1);
  });

  it('XL-14 không còn hồ sơ le_tan ⇒ 403 KHONG_DU_QUYEN ở cả hai route', async () => {
    const w = await setup();
    await db.query('DELETE FROM le_tan WHERE tai_khoan_id = ?', [
      w.receptionist.account.taiKhoanId,
    ]);
    // Query hợp lệ cho từng route (route `doctors` không khai tuNgay/denNgay): 403 phải đến từ phạm vi, không từ kiểm dữ liệu.
    const queryOf: [string, Record<string, string>][] = [
      [grid, week],
      [doctors, {}],
    ];
    for (const [path, query] of queryOf)
      expectErrorResponse(
        await get(path, query, w.tokenA),
        403,
        'KHONG_DU_QUYEN',
      );
  });

  it('QH-03 đổi chi nhánh của Lễ tân có hiệu lực ngay ở request sau (đọc DB mỗi request, không cache)', async () => {
    const w = await setup();
    await fx.admin.shift(w.alpha.profile, { ngay: MON, ca: 'CaSang' });
    const before = await get(grid, week, w.tokenA).expect(200);
    expect(idsOf(before.body.items)).toContain(w.alpha.account.taiKhoanId);

    await db.query(
      'UPDATE le_tan SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [w.branchB.chiNhanhId, w.receptionist.account.taiKhoanId],
    );
    const after = await get(grid, week, w.tokenA).expect(200);
    expect(idsOf(after.body.items)).not.toContain(w.alpha.account.taiKhoanId);
    expect(idsOf(after.body.items)).toContain(w.beta.account.taiKhoanId);
  });

  it('phạm vi do server quyết: gửi chiNhanhId ⇒ 400 (không chọn được chi nhánh khác); khoảng ngày sai ⇒ 400 KHOANG_NGAY_KHONG_HOP_LE', async () => {
    const w = await setup();
    const body = expectErrorResponse(
      await get(grid, { ...week, chiNhanhId: w.branchB.chiNhanhId }, w.tokenA),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(body.loi?.map((l) => l.ma)).toEqual(['TRUONG_KHONG_DUOC_PHEP']);
    const bad: Record<string, string>[] = [
      { tuNgay: SUN, denNgay: MON },
      { tuNgay: '2026-12-01', denNgay: '2027-01-12' }, // 43 ngày
      { denNgay: SUN },
      {},
    ];
    for (const query of bad)
      expectErrorResponse(
        await get(grid, query, w.tokenA),
        400,
        'KHOANG_NGAY_KHONG_HOP_LE',
      );
    await get(
      grid,
      { tuNgay: '2026-12-01', denNgay: '2027-01-11' },
      w.tokenA,
    ).expect(200);
  });

  it('lưới: lọc ca và chuyên khoa chỉ thu hẹp ca/bác sĩ; bác sĩ không có ca vẫn có hàng ca []; no-store', async () => {
    const w = await setup();
    await fx.admin.shift(w.alpha.profile, { ngay: MON, ca: 'CaSang' });
    await fx.admin.shift(w.alpha.profile, { ngay: MON, ca: 'CaChieu' });
    const res = await get(grid, { ...week, ca: 'CaChieu' }, w.tokenA).expect(
      200,
    );
    expect(res.headers['cache-control']).toBe('no-store');
    const alphaRow = res.body.items.find(
      (i: { bacSiId: string }) => i.bacSiId === w.alpha.account.taiKhoanId,
    );
    expect(alphaRow.ca.map((s: { ca: string }) => s.ca)).toEqual(['CaChieu']);
    const deltaRow = res.body.items.find(
      (i: { bacSiId: string }) => i.bacSiId === w.delta.account.taiKhoanId,
    );
    expect(deltaRow.ca).toEqual([]);

    const bySpecialty = await get(
      grid,
      { ...week, chuyenKhoaId: w.alpha.profile.chuyenKhoaId },
      w.tokenA,
    ).expect(200);
    expect(idsOf(bySpecialty.body.items)).toEqual([w.alpha.account.taiKhoanId]);
  });

  it('QH-01 Bác sĩ, Quản trị viên ⇒ 403; không đăng nhập ⇒ 401 (cả hai route)', async () => {
    const w = await setup();
    for (const path of [grid, doctors]) {
      expectErrorResponse(
        await request(app.getHttpServer()).get(path).query(week),
        401,
        'CHUA_DANG_NHAP',
      );
      for (const account of [
        w.alpha.account,
        w.systemAdmin.account,
        w.branchAdmin.account,
      ])
        expectErrorResponse(
          await get(path, week, await tokenOf(account.taiKhoanId)),
          403,
          'KHONG_DU_QUYEN',
        );
    }
  });
});
