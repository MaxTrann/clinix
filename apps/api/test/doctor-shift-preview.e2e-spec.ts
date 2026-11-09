import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ModulesContainer } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { DoctorFixtures } from '../src/doctor/testing/doctor-fixtures.js';
import { auditAdminControllers } from '../src/rbac/testing/admin-route-audit.js';

// Doctor B2 — POST /admin/doctor-shifts/preview qua HTTP thật + MySQL thật:
// PC-03, PC-05, PC-06, PC-07, PC-08, PC-09, PC-10, PC-11, PC-12, PC-14, PC-15, PC-16, PC-17, PC-18, PC-25 (phần), BD-01.
describe('B2 — xem trước phân công', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: DoctorFixtures;
  let sessions: SessionService;
  const url = '/admin/doctor-shifts/preview';
  // Thứ Hai 2026-12-07 ở tương lai so với đồng hồ thật của test.
  const MON = '2026-12-07';

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
  const preview = (body: object, token: string) =>
    request(app.getHttpServer())
      .post(url)
      .auth(token, { type: 'bearer' })
      .send(body);
  const rule = (bacSiIds: string[], over: object = {}) => ({
    bacSiIds,
    tuNgay: MON,
    denNgay: MON,
    thuTrongTuan: [1],
    cas: ['CaSang'],
    ...over,
  });
  const count = async (table: string) =>
    Number((await db.query(`SELECT COUNT(*) AS so FROM ${table}`))[0].so);

  async function setup() {
    const world = await fx.world();
    return {
      ...world,
      doctorId: world.doctor.account.taiKhoanId,
      systemToken: await tokenOf(world.systemAdmin.account.taiKhoanId),
      branchToken: await tokenOf(world.branchAdmin.account.taiKhoanId),
    };
  }

  it('QH-01: route preview có role QuanTriVien và phạm vi, không public', () => {
    const controllers = [...app.get(ModulesContainer).values()].flatMap((m) =>
      [...m.controllers.values()].flatMap((w) =>
        w.metatype ? [w.metatype] : [],
      ),
    );
    expect(controllers.map((c) => c.name)).toContain(
      'ShiftAssignmentController',
    );
    expect(auditAdminControllers(controllers)).toEqual([]);
  });

  it('PC-17 ca hợp lệ: 200 { soCa, soKhungGio, viPham: [] } và KHÔNG ghi gì (đếm bảng không đổi)', async () => {
    const { doctorId, systemToken } = await setup();
    const before = [
      await count('lich_lam_viec'),
      await count('khung_gio'),
      await count('nhat_ky_hanh_dong'),
    ];
    const res = await preview(
      rule([doctorId], { cas: ['CaSang', 'CaChieu'] }),
      systemToken,
    ).expect(200);
    expect(res.body).toEqual({
      soCa: 2,
      soKhungGio: 16,
      tongSoViPham: 0,
      viPham: [],
    });
    expect([
      await count('lich_lam_viec'),
      await count('khung_gio'),
      await count('nhat_ky_hanh_dong'),
    ]).toEqual(before);
  });

  it('PC-12 quy tắc lặp 3 tuần T2–T6 cả ngày, 2 bác sĩ ⇒ 60 ca và 480 khung giờ', async () => {
    const { branch, doctorId, systemToken } = await setup();
    const second = await fx.admin.doctor(branch);
    const res = await preview(
      rule([doctorId, second.account.taiKhoanId], {
        denNgay: '2026-12-25',
        thuTrongTuan: [1, 2, 3, 4, 5],
        cas: ['CaSang', 'CaChieu'],
      }),
      systemToken,
    ).expect(200);
    expect(res.body).toMatchObject({ soCa: 60, soKhungGio: 480, viPham: [] });
  });

  it('PC-05/PC-06 đã có CaSang: CaSang ⇒ CA_DA_PHAN_CONG, CaChieu cùng ngày vẫn hợp lệ', async () => {
    const { doctor, doctorId, systemToken } = await setup();
    await fx.admin.shift(doctor.profile, { ngay: MON, ca: 'CaSang' });
    const res = await preview(
      rule([doctorId], { cas: ['CaSang', 'CaChieu'] }),
      systemToken,
    ).expect(200);
    expect(res.body).toMatchObject({ soCa: 2, soKhungGio: 8, tongSoViPham: 1 });
    expect(res.body.viPham).toEqual([
      { bacSiId: doctorId, ngay: MON, ca: 'CaSang', maLoi: 'CA_DA_PHAN_CONG' },
    ]);
  });

  it('PC-03 ngày đã qua ⇒ NGAY_PHAN_CONG_DA_QUA trong viPham (không ghi)', async () => {
    const { doctorId, systemToken } = await setup();
    const res = await preview(
      rule([doctorId], { tuNgay: '2020-01-06', denNgay: '2020-01-06' }),
      systemToken,
    ).expect(200);
    expect(res.body.viPham[0]).toMatchObject({
      maLoi: 'NGAY_PHAN_CONG_DA_QUA',
      ngay: '2020-01-06',
    });
  });

  it('PC-07 Chủ nhật chi nhánh nghỉ ⇒ CHI_NHANH_NGHI, thuTrongTuan 7', async () => {
    const { branch, doctorId, systemToken } = await setup();
    await db.query(
      `UPDATE chi_nhanh_lich_hoat_dong SET hoat_dong = 0, gio_bat_dau_sang = NULL, gio_ket_thuc_sang = NULL,
              gio_bat_dau_chieu = NULL, gio_ket_thuc_chieu = NULL WHERE chi_nhanh_id = ? AND thu_trong_tuan = 7`,
      [branch.chiNhanhId],
    );
    const res = await preview(
      rule([doctorId], {
        tuNgay: '2026-12-13',
        denNgay: '2026-12-13',
        thuTrongTuan: [7],
      }),
      systemToken,
    ).expect(200);
    expect(res.body.viPham[0]).toMatchObject({
      maLoi: 'CHI_NHANH_NGHI',
      chiTiet: { thuTrongTuan: 7 },
    });
  });

  it('PC-08 thứ chưa khai báo (xoá dòng) ⇒ CHI_NHANH_CHUA_KHAI_BAO', async () => {
    const { branch, doctorId, systemToken } = await setup();
    await db.query(
      'DELETE FROM chi_nhanh_lich_hoat_dong WHERE chi_nhanh_id = ? AND thu_trong_tuan = 1',
      [branch.chiNhanhId],
    );
    const res = await preview(rule([doctorId]), systemToken).expect(200);
    expect(res.body.viPham[0]).toMatchObject({
      maLoi: 'CHI_NHANH_CHUA_KHAI_BAO',
    });
  });

  it('PC-09/PC-10 thứ chỉ có buổi sáng: CaChieu ⇒ CA_KHONG_TON_TAI kèm khoảng nhận khám, CaSang không bị báo', async () => {
    const { branch, doctorId, systemToken } = await setup();
    await db.query(
      `UPDATE chi_nhanh_lich_hoat_dong SET gio_bat_dau_chieu = NULL, gio_ket_thuc_chieu = NULL
        WHERE chi_nhanh_id = ? AND thu_trong_tuan = 1`,
      [branch.chiNhanhId],
    );
    const res = await preview(
      rule([doctorId], { cas: ['CaSang', 'CaChieu'] }),
      systemToken,
    ).expect(200);
    expect(res.body.viPham).toEqual([
      {
        bacSiId: doctorId,
        ngay: MON,
        ca: 'CaChieu',
        maLoi: 'CA_KHONG_TON_TAI',
        chiTiet: {
          thuTrongTuan: 1,
          khoang: { sang: { tu: '08:00', den: '12:00' }, chieu: null },
        },
      },
    ]);
  });

  it('PC-14 vi phạm ở bác sĩ thứ hai ⇒ viPham[] đúng bác sĩ, ngày; bác sĩ đầu sạch', async () => {
    const { branch, doctor, doctorId, systemToken } = await setup();
    const second = await fx.admin.doctor(branch);
    await fx.admin.shift(second.profile, { ngay: '2026-12-08', ca: 'CaSang' });
    const res = await preview(
      rule([doctorId, second.account.taiKhoanId], {
        denNgay: '2026-12-09',
        thuTrongTuan: [1, 2, 3],
      }),
      systemToken,
    ).expect(200);
    expect(doctor.profile.chiNhanhId).toBe(branch.chiNhanhId);
    expect(res.body.viPham).toEqual([
      {
        bacSiId: second.account.taiKhoanId,
        ngay: '2026-12-08',
        ca: 'CaSang',
        maLoi: 'CA_DA_PHAN_CONG',
      },
    ]);
  });

  it('PC-15 khoảng 93 ngày / quá 1.000 ca / không chứa thứ nào / denNgay < tuNgay ⇒ 400 mã tương ứng', async () => {
    const { doctorId, systemToken } = await setup();
    const every = [1, 2, 3, 4, 5, 6, 7];
    const bad = async (over: object, maLoi: string) =>
      expectErrorResponse(
        await preview(rule([doctorId], over), systemToken),
        400,
        maLoi,
      );
    await bad(
      { tuNgay: '2026-12-01', denNgay: '2027-03-03', thuTrongTuan: every },
      'KHOANG_NGAY_KHONG_HOP_LE',
    );
    await bad(
      { tuNgay: '2026-12-08', denNgay: '2026-12-08' },
      'KHOANG_NGAY_KHONG_HOP_LE',
    );
    await bad(
      { tuNgay: '2026-12-08', denNgay: '2026-12-07' },
      'KHOANG_NGAY_KHONG_HOP_LE',
    );
    const many = Array.from({ length: 20 }, (_, i) => String(i + 1));
    expectErrorResponse(
      await preview(
        rule(many, {
          tuNgay: '2026-12-01',
          denNgay: '2026-12-26',
          thuTrongTuan: every,
          cas: ['CaSang', 'CaChieu'],
        }),
        systemToken,
      ),
      400,
      'QUA_NHIEU_CA',
    );
  });

  it('PC-11 CaToi ⇒ 400 DU_LIEU_KHONG_HOP_LE với cas: CA_KHONG_HOP_LE; BD-01/PC-02 chiNhanhId trong thân ⇒ TRUONG_KHONG_DUOC_PHEP', async () => {
    const { doctorId, systemToken } = await setup();
    const caToi = expectErrorResponse(
      await preview(rule([doctorId], { cas: ['CaToi'] }), systemToken),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(caToi.loi).toContainEqual({ truong: 'cas', ma: 'CA_KHONG_HOP_LE' });
    const extra = expectErrorResponse(
      await preview(rule([doctorId], { chiNhanhId: '1' }), systemToken),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(extra.loi).toContainEqual({
      truong: 'chiNhanhId',
      ma: 'TRUONG_KHONG_DUOC_PHEP',
    });
  });

  it('PC-16 bác sĩ NgungHoatDong ⇒ 409 BAC_SI_KHONG_PHAN_CONG_DUOC; ChoKichHoat được nhận', async () => {
    const { branch, systemToken } = await setup();
    const stopped = await fx.admin.doctor(
      branch,
      {},
      { trangThai: 'NgungHoatDong' },
    );
    const waiting = await fx.admin.doctor(
      branch,
      {},
      { trangThai: 'ChoKichHoat', matKhauBam: null },
    );
    expectErrorResponse(
      await preview(rule([stopped.account.taiKhoanId]), systemToken),
      409,
      'BAC_SI_KHONG_PHAN_CONG_DUOC',
    );
    await preview(rule([waiting.account.taiKhoanId]), systemToken).expect(200);
  });

  it('PC-18 Admin Chi nhánh: bác sĩ chi nhánh mình ⇒ 200; chi nhánh khác hoặc không tồn tại ⇒ 404 cùng thân KHONG_TIM_THAY', async () => {
    const { doctorId, branchToken } = await setup();
    const other = await fx.admin.doctor(await fx.admin.branch());
    await preview(rule([doctorId]), branchToken).expect(200);
    const outside = await preview(
      rule([other.account.taiKhoanId]),
      branchToken,
    );
    const missing = await preview(rule(['999999999']), branchToken);
    expectErrorResponse(outside, 404, 'KHONG_TIM_THAY');
    expect(missing.body).toEqual(outside.body);
    // Cả yêu cầu bị 404 nếu có MỘT bác sĩ ngoài phạm vi.
    expectErrorResponse(
      await preview(rule([doctorId, other.account.taiKhoanId]), branchToken),
      404,
      'KHONG_TIM_THAY',
    );
  });

  it('PC-25 (phần) không token ⇒ 401; Bác sĩ, Lễ tân ⇒ 403', async () => {
    const { doctor, receptionist } = await setup();
    expectErrorResponse(
      await request(app.getHttpServer())
        .post(url)
        .send(rule(['1'])),
      401,
      'CHUA_DANG_NHAP',
    );
    for (const account of [doctor.account, receptionist.account])
      expectErrorResponse(
        await preview(rule(['1']), await tokenOf(account.taiKhoanId)),
        403,
        'KHONG_DU_QUYEN',
      );
  });
});
