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

// Doctor B9 — GET /admin/doctor-shifts/doctors và GET /admin/doctor-shifts qua HTTP thật + MySQL thật:
// PC-29, PC-30, XL-19, QH-02 (xem), QH-10.
describe('B9 — Quản trị viên xem lịch làm việc bác sĩ', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: DoctorFixtures;
  let sessions: SessionService;
  const grid = '/admin/doctor-shifts';
  const doctors = '/admin/doctor-shifts/doctors';
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

  /**
   * Chi nhánh A (Admin Chi nhánh) có bác sĩ Alpha; chi nhánh B có bác sĩ Beta; bác sĩ Gamma có hồ sơ ở B nhưng từng có ca ở A.
   */
  async function setup() {
    const world = await fx.world();
    const branchB = await fx.admin.branch();
    await fx.admin.weeklySchedule(branchB.chiNhanhId);
    const alpha = world.doctor; // hồ sơ ở A
    await db.query('UPDATE tai_khoan SET ho_ten = ? WHERE tai_khoan_id = ?', [
      'Nguyễn Alpha',
      alpha.account.taiKhoanId,
    ]);
    const beta = await fx.admin.doctor(branchB, {}, { hoTen: 'Trần Beta' });
    const gamma = await fx.admin.doctor(branchB, {}, { hoTen: 'Lê Gamma' });
    return {
      ...world,
      branchB,
      alpha,
      beta,
      gamma,
      systemToken: await tokenOf(world.systemAdmin.account.taiKhoanId),
      branchToken: await tokenOf(world.branchAdmin.account.taiKhoanId),
    };
  }
  const idsOf = (items: { bacSiId: string }[]) => items.map((i) => i.bacSiId);

  it('PC-29 danh sách chọn: sắp theo tên, kèm chi nhánh, chuyên khoa; lọc q, chuyên khoa, chi nhánh; phân trang', async () => {
    const { systemToken, alpha, beta, gamma, branchB } = await setup();
    const all = await get(doctors, {}, systemToken).expect(200);
    expect(all.headers['cache-control']).toBe('no-store');
    expect(all.body).toMatchObject({ total: 3, page: 1, pageSize: 20 });
    expect(all.body.items.map((i: { hoTen: string }) => i.hoTen)).toEqual([
      'Lê Gamma',
      'Nguyễn Alpha',
      'Trần Beta',
    ]);
    expect(all.body.items[1]).toMatchObject({
      bacSiId: alpha.account.taiKhoanId,
      ngungHoatDong: false,
      chiNhanh: { chiNhanhId: alpha.profile.chiNhanhId },
      chuyenKhoa: { chuyenKhoaId: alpha.profile.chuyenKhoaId },
    });

    const byName = await get(doctors, { q: 'beta' }, systemToken).expect(200);
    expect(idsOf(byName.body.items)).toEqual([beta.account.taiKhoanId]);
    const bySpecialty = await get(
      doctors,
      { chuyenKhoaId: gamma.profile.chuyenKhoaId },
      systemToken,
    ).expect(200);
    expect(idsOf(bySpecialty.body.items)).toEqual([gamma.account.taiKhoanId]);
    const byBranch = await get(
      doctors,
      { chiNhanhId: branchB.chiNhanhId },
      systemToken,
    ).expect(200);
    expect(idsOf(byBranch.body.items).sort()).toEqual(
      [beta.account.taiKhoanId, gamma.account.taiKhoanId].sort(),
    );

    const page2 = await get(
      doctors,
      { page: '2', pageSize: '2' },
      systemToken,
    ).expect(200);
    expect(page2.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(idsOf(page2.body.items)).toEqual([beta.account.taiKhoanId]);
  });

  it('PC-29 q có %, _ được escape: chỉ khớp đúng ký tự, không phải ký tự đại diện', async () => {
    const { systemToken, branchB } = await setup();
    const special = await fx.admin.doctor(
      branchB,
      {},
      { hoTen: 'Phạm 50%_Test' },
    );
    const res = await get(doctors, { q: '%_' }, systemToken).expect(200);
    expect(idsOf(res.body.items)).toEqual([special.account.taiKhoanId]);
    const underscore = await get(doctors, { q: '_T' }, systemToken).expect(200);
    expect(idsOf(underscore.body.items)).toEqual([special.account.taiKhoanId]);
  });

  it('PC-29 tham số sai: q 1 ký tự, id sai dạng, pageSize > 100, chuyenKhoaId chữ ⇒ 400 DU_LIEU_KHONG_HOP_LE', async () => {
    const { systemToken } = await setup();
    const invalid: Record<string, string>[] = [
      { q: 'a' },
      { chiNhanhId: 'abc' },
      { pageSize: '101' },
      { chuyenKhoaId: '0' },
    ];
    for (const query of invalid)
      expectErrorResponse(
        await get(doctors, query, systemToken),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
  });

  it('QH-10 Admin Chi nhánh chỉ thấy bác sĩ trong phạm vi (hồ sơ HOẶC có ca ở chi nhánh); chiNhanhId của chi nhánh khác bị bỏ qua', async () => {
    const { branchToken, branch, alpha, beta, gamma, branchB } = await setup();
    await fx.admin.shift(gamma.profile, {
      ngay: MON,
      ca: 'CaSang',
      chiNhanhId: branch.chiNhanhId,
    }); // Gamma từng làm ở A
    const res = await get(doctors, {}, branchToken).expect(200);
    expect(idsOf(res.body.items).sort()).toEqual(
      [alpha.account.taiKhoanId, gamma.account.taiKhoanId].sort(),
    );
    expect(idsOf(res.body.items)).not.toContain(beta.account.taiKhoanId);

    const forced = await get(
      doctors,
      { chiNhanhId: branchB.chiNhanhId },
      branchToken,
    ).expect(200);
    expect(idsOf(forced.body.items).sort()).toEqual(
      idsOf(res.body.items).sort(),
    );
    expect(res.body.total).toBe(2); // COUNT dùng cùng điều kiện với danh sách
  });

  it('PC-30 lưới: ca trong khoảng (gồm hai đầu), giờ ca, lọc ca; bác sĩ không có ca vẫn có hàng với ca []', async () => {
    const { systemToken, alpha, beta, gamma } = await setup();
    await fx.admin.shift(alpha.profile, { ngay: MON, ca: 'CaSang' });
    await fx.admin.shift(alpha.profile, { ngay: SUN, ca: 'CaChieu' });
    await fx.admin.shift(alpha.profile, { ngay: '2026-12-14', ca: 'CaSang' }); // ngoài khoảng

    const res = await get(grid, week, systemToken).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({ tuNgay: MON, denNgay: SUN, total: 3 });
    const rows = new Map<
      string,
      { ca: { ngay: string; ca: string; batDau: string | null }[] }
    >(res.body.items.map((i: { bacSiId: string }) => [i.bacSiId, i]));
    expect(rows.get(alpha.account.taiKhoanId)?.ca).toMatchObject([
      { ngay: MON, ca: 'CaSang', batDau: '08:00' },
      { ngay: SUN, ca: 'CaChieu', batDau: '13:00' },
    ]);
    expect(rows.get(beta.account.taiKhoanId)?.ca).toEqual([]);
    expect(rows.get(gamma.account.taiKhoanId)?.ca).toEqual([]);

    const onlyAfternoon = await get(
      grid,
      { ...week, ca: 'CaChieu' },
      systemToken,
    ).expect(200);
    const alphaRow = onlyAfternoon.body.items.find(
      (i: { bacSiId: string }) => i.bacSiId === alpha.account.taiKhoanId,
    );
    expect(alphaRow.ca.map((s: { ca: string }) => s.ca)).toEqual(['CaChieu']);
    expect(onlyAfternoon.body.total).toBe(3); // lọc ca chỉ thu hẹp ca, không loại bác sĩ
  });

  it('PC-30 khoảng ngày sai ⇒ 400 KHOANG_NGAY_KHONG_HOP_LE; đúng 42 ngày thì được', async () => {
    const { systemToken } = await setup();
    const bad: Record<string, string>[] = [
      { tuNgay: SUN, denNgay: MON },
      { tuNgay: '2026-12-01', denNgay: '2027-01-12' }, // 43 ngày
      { tuNgay: '13/12/2026', denNgay: SUN },
      { denNgay: SUN },
      {},
    ];
    for (const query of bad)
      expectErrorResponse(
        await get(grid, query, systemToken),
        400,
        'KHOANG_NGAY_KHONG_HOP_LE',
      );
    await get(
      grid,
      { tuNgay: '2026-12-01', denNgay: '2027-01-11' },
      systemToken,
    ).expect(200);
  });

  it('XL-19 Admin Chi nhánh xem lưới: cùng vị từ như Lễ tân, chỉ ca mang chi nhánh mình; bác sĩ chuyển chi nhánh vẫn thấy ca cũ', async () => {
    const { branchToken, branch, alpha, beta, gamma, branchB } = await setup();
    await fx.admin.shift(alpha.profile, { ngay: MON, ca: 'CaSang' });
    await fx.admin.shift(beta.profile, {
      ngay: MON,
      ca: 'CaSang',
      chiNhanhId: branchB.chiNhanhId,
    });
    await fx.admin.shift(gamma.profile, {
      ngay: MON,
      ca: 'CaChieu',
      chiNhanhId: branch.chiNhanhId,
    }); // ca cũ ở A
    await fx.admin.shift(gamma.profile, {
      ngay: '2026-12-08',
      ca: 'CaSang',
      chiNhanhId: branchB.chiNhanhId,
    }); // ca mới ở B

    const res = await get(grid, week, branchToken).expect(200);
    expect(idsOf(res.body.items).sort()).toEqual(
      [alpha.account.taiKhoanId, gamma.account.taiKhoanId].sort(),
    );
    const gammaRow = res.body.items.find(
      (i: { bacSiId: string }) => i.bacSiId === gamma.account.taiKhoanId,
    );
    expect(gammaRow.ca).toHaveLength(1); // ca ở chi nhánh B không rời DB
    expect(gammaRow.ca[0]).toMatchObject({
      ngay: MON,
      ca: 'CaChieu',
      chiNhanh: { chiNhanhId: branch.chiNhanhId },
    });
    // Mọi ca trong phản hồi đều mang chi nhánh A (hồ sơ của Gamma ở B vẫn hiện ở dòng bác sĩ là hợp lệ).
    const shiftBranches = res.body.items.flatMap(
      (i: { ca: { chiNhanh: { chiNhanhId: string } }[] }) =>
        i.ca.map((s) => s.chiNhanh.chiNhanhId),
    );
    expect(new Set(shiftBranches)).toEqual(new Set([branch.chiNhanhId]));
  });

  it('XL-19 bacSiId ngoài phạm vi và không tồn tại ⇒ 404 KHONG_TIM_THAY cùng thân', async () => {
    const { branchToken, systemToken, beta } = await setup();
    const outside = expectErrorResponse(
      await get(
        grid,
        { ...week, bacSiId: beta.account.taiKhoanId },
        branchToken,
      ),
      404,
      'KHONG_TIM_THAY',
    );
    const missing = expectErrorResponse(
      await get(grid, { ...week, bacSiId: '999999999' }, branchToken),
      404,
      'KHONG_TIM_THAY',
    );
    expect(missing).toEqual(outside);
    expectErrorResponse(
      await get(grid, { ...week, bacSiId: '999999999' }, systemToken),
      404,
      'KHONG_TIM_THAY',
    );
    expectErrorResponse(
      await get(grid, { ...week, bacSiId: 'abc' }, systemToken),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
  });

  it('QH-02 Toàn hệ thống thấy mọi chi nhánh và mọi ca; lọc bacSiId đúng người; Admin Chi nhánh chỉ phạm vi', async () => {
    const { systemToken, branchToken, alpha, beta, gamma, branch, branchB } =
      await setup();
    await fx.admin.shift(alpha.profile, { ngay: MON, ca: 'CaSang' });
    await fx.admin.shift(beta.profile, {
      ngay: MON,
      ca: 'CaSang',
      chiNhanhId: branchB.chiNhanhId,
    });
    await fx.admin.shift(gamma.profile, {
      ngay: MON,
      ca: 'CaChieu',
      chiNhanhId: branch.chiNhanhId,
    });
    await fx.admin.shift(gamma.profile, {
      ngay: '2026-12-08',
      ca: 'CaSang',
      chiNhanhId: branchB.chiNhanhId,
    });

    const system = await get(grid, week, systemToken).expect(200);
    expect(system.body.total).toBe(3);
    const gammaRow = system.body.items.find(
      (i: { bacSiId: string }) => i.bacSiId === gamma.account.taiKhoanId,
    );
    expect(gammaRow.ca).toHaveLength(2); // Toàn hệ thống thấy cả ca ở hai chi nhánh

    const one = await get(
      grid,
      { ...week, bacSiId: beta.account.taiKhoanId },
      systemToken,
    ).expect(200);
    expect(idsOf(one.body.items)).toEqual([beta.account.taiKhoanId]);
    expect((await get(grid, week, branchToken).expect(200)).body.total).toBe(2);
  });

  it('Q16 Admin thấy nghỉ DaDuyet/ChoDuyet trên ca; TuChoi không hiện; không có lý do nghỉ', async () => {
    const { systemToken, systemAdmin, alpha } = await setup();
    const id = alpha.account.taiKhoanId;
    const handled = {
      nguoiXuLyId: systemAdmin.account.taiKhoanId,
      thoiDiemXuLy: '2026-12-01 09:00:00',
    };
    for (const ngay of [MON, '2026-12-08', '2026-12-09'])
      await fx.admin.shift(alpha.profile, { ngay, ca: 'CaSang' });
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

    const res = await get(grid, { ...week, bacSiId: id }, systemToken).expect(
      200,
    );
    expect(
      res.body.items[0].ca.map(
        (s: { ngay: string; nghiPhep: string | null }) => [s.ngay, s.nghiPhep],
      ),
    ).toEqual([
      [MON, 'DaDuyet'],
      ['2026-12-08', 'ChoDuyet'],
      ['2026-12-09', null],
    ]);
    expect(JSON.stringify(res.body)).not.toContain('Việc gia đình');
  });

  it('QH-02 Lễ tân, Bác sĩ ⇒ 403; không đăng nhập ⇒ 401 (cả hai route)', async () => {
    const w = await setup();
    for (const path of [grid, doctors]) {
      expectErrorResponse(
        await request(app.getHttpServer()).get(path).query(week),
        401,
        'CHUA_DANG_NHAP',
      );
      for (const account of [w.receptionist.account, w.alpha.account])
        expectErrorResponse(
          await get(path, week, await tokenOf(account.taiKhoanId)),
          403,
          'KHONG_DU_QUYEN',
        );
    }
  });
});
