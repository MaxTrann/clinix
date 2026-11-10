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

// Doctor B7 — GET /doctor/schedule qua HTTP thật + MySQL thật:
// XL-01…XL-07, XL-15, XL-16, XL-18, XL-20, QH-04.
describe('B7 — Bác sĩ xem lịch làm việc', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: DoctorFixtures;
  let sessions: SessionService;
  const url = '/doctor/schedule';
  const MON = '2026-12-07'; // Thứ Hai
  const SUN = '2026-12-13';

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
  const get = (query: Record<string, string>, token: string) =>
    request(app.getHttpServer())
      .get(url)
      .query(query)
      .auth(token, { type: 'bearer' });
  const week = { tuNgay: MON, denNgay: SUN };

  async function setup() {
    const world = await fx.world();
    return {
      ...world,
      doctorId: world.doctor.account.taiKhoanId,
      token: await tokenOf(world.doctor.account.taiKhoanId),
    };
  }

  it('XL-01 có ca trong tuần: ngày, ca, chi nhánh trên ca, giờ; sắp theo ngày rồi ca', async () => {
    const { doctor, branch, token } = await setup();
    await fx.admin.shift(doctor.profile, { ngay: '2026-12-08', ca: 'CaChieu' });
    await fx.admin.shift(doctor.profile, { ngay: MON, ca: 'CaSang' });
    await fx.admin.shift(doctor.profile, { ngay: '2026-12-14', ca: 'CaSang' }); // ngoài tuần

    const res = await get(week, token).expect(200);
    expect(res.body).toMatchObject({ tuNgay: MON, denNgay: SUN, nghiPhep: [] });
    expect(res.body.ca).toMatchObject([
      {
        ngay: MON,
        ca: 'CaSang',
        batDau: '08:00',
        ketThuc: '12:00',
        gioCaKhongCon: false,
        nghiPhep: null,
        chiNhanh: { chiNhanhId: branch.chiNhanhId, ten: branch.ten },
      },
      {
        ngay: '2026-12-08',
        ca: 'CaChieu',
        batDau: '13:00',
        ketThuc: '17:00',
        nghiPhep: null,
      },
    ]);
  });

  it('XL-02 bác sĩ đã đổi chi nhánh: thấy ca cũ và mới; chiNhanhLoc có 2; lọc chiNhanhId đúng', async () => {
    const { doctor, branch, token } = await setup();
    const oldBranch = await fx.admin.branch();
    await fx.admin.weeklySchedule(oldBranch.chiNhanhId);
    await fx.admin.shift(doctor.profile, {
      ngay: MON,
      ca: 'CaSang',
      chiNhanhId: oldBranch.chiNhanhId,
    });
    await fx.admin.shift(doctor.profile, { ngay: '2026-12-08', ca: 'CaSang' });

    const all = await get(week, token).expect(200);
    expect(all.body.ca).toHaveLength(2);
    expect(
      all.body.chiNhanhLoc
        .map((b: { chiNhanhId: string }) => b.chiNhanhId)
        .sort(),
    ).toEqual([branch.chiNhanhId, oldBranch.chiNhanhId].sort());

    const filtered = await get(
      { ...week, chiNhanhId: oldBranch.chiNhanhId },
      token,
    ).expect(200);
    expect(filtered.body.ca).toHaveLength(1);
    expect(filtered.body.ca[0].chiNhanh.chiNhanhId).toBe(oldBranch.chiNhanhId);
    expect(filtered.body.chiNhanhLoc).toHaveLength(2); // danh sách chọn không mất sau khi lọc
  });

  it('XL-03 lọc ca đúng; ca không hợp lệ ⇒ 400 DU_LIEU_KHONG_HOP_LE', async () => {
    const { doctor, token } = await setup();
    await fx.admin.shift(doctor.profile, { ngay: MON, ca: 'CaSang' });
    await fx.admin.shift(doctor.profile, { ngay: MON, ca: 'CaChieu' });
    const res = await get({ ...week, ca: 'CaChieu' }, token).expect(200);
    expect(res.body.ca.map((s: { ca: string }) => s.ca)).toEqual(['CaChieu']);
    expectErrorResponse(
      await get({ ...week, ca: 'CaToi' }, token),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
  });

  it('XL-04 ngày nghỉ: DaDuyet > ChoDuyet > TuChoi; mỗi ca một trạng thái; nghiPhep[] không có lý do', async () => {
    const { doctor, doctorId, systemAdmin, token } = await setup();
    const handled = {
      nguoiXuLyId: systemAdmin.account.taiKhoanId,
      thoiDiemXuLy: '2026-12-01 09:00:00',
    };
    for (const ngay of [MON, '2026-12-08', '2026-12-09', '2026-12-10'])
      await fx.admin.shift(doctor.profile, { ngay, ca: 'CaSang' });
    await fx.leaveRequest({
      bacSiId: doctorId,
      batDau: MON,
      trangThai: 'TuChoi',
      ...handled,
    });
    await fx.leaveRequest({
      bacSiId: doctorId,
      batDau: '2026-12-08',
      trangThai: 'TuChoi',
      ...handled,
    });
    await fx.leaveRequest({ bacSiId: doctorId, batDau: '2026-12-08' }); // ChoDuyet cùng ngày
    await fx.leaveRequest({
      bacSiId: doctorId,
      batDau: '2026-12-09',
      trangThai: 'DaDuyet',
      ...handled,
    });
    await fx.leaveRequest({ bacSiId: doctorId, batDau: '2026-12-09' }); // ChoDuyet cùng ngày: DaDuyet thắng

    const res = await get(week, token).expect(200);
    expect(
      res.body.ca.map((s: { ngay: string; nghiPhep: string | null }) => [
        s.ngay,
        s.nghiPhep,
      ]),
    ).toEqual([
      [MON, 'TuChoi'],
      ['2026-12-08', 'ChoDuyet'],
      ['2026-12-09', 'DaDuyet'],
      ['2026-12-10', null],
    ]);
    expect(res.body.nghiPhep).toHaveLength(5);
    expect(JSON.stringify(res.body)).not.toContain('Việc gia đình');
    expect(res.body.nghiPhep[0]).not.toHaveProperty('lyDo');
  });

  it('XL-05 không có ca: 200 ca [] (lịch trống), không phải lỗi', async () => {
    const { token } = await setup();
    const res = await get(week, token).expect(200);
    expect(res.body).toEqual({
      tuNgay: MON,
      denNgay: SUN,
      ca: [],
      nghiPhep: [],
      chiNhanhLoc: [],
    });
  });

  it('XL-06 gửi bacSiId hoặc tham số lạ ⇒ 400 TRUONG_KHONG_DUOC_PHEP; không xem được bác sĩ khác', async () => {
    const { branch, token } = await setup();
    const colleague = await fx.admin.doctor(branch);
    await fx.admin.shift(colleague.profile, { ngay: MON, ca: 'CaSang' });
    const extras: Record<string, string>[] = [
      { bacSiId: colleague.account.taiKhoanId },
      { khac: '1' },
    ];
    for (const extra of extras) {
      const query: Record<string, string> = { ...week, ...extra };
      const body = expectErrorResponse(
        await get(query, token),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
      expect(body.loi?.map((l) => l.ma)).toEqual(['TRUONG_KHONG_DUOC_PHEP']);
    }
  });

  it('XL-07 khoảng ngày sai ⇒ 400 KHOANG_NGAY_KHONG_HOP_LE; 42 ngày thì được', async () => {
    const { token } = await setup();
    const bad: Record<string, string>[] = [
      { tuNgay: SUN, denNgay: MON },
      { tuNgay: '2026-12-01', denNgay: '2027-01-12' }, // 43 ngày
      { tuNgay: '07-12-2026', denNgay: SUN },
      { denNgay: SUN },
      {},
    ];
    for (const query of bad)
      expectErrorResponse(
        await get(query, token),
        400,
        'KHOANG_NGAY_KHONG_HOP_LE',
      );
    await get({ tuNgay: '2026-12-01', denNgay: '2027-01-11' }, token).expect(
      200,
    );
  });

  it('XL-15 giờ ca theo lịch hoạt động HIỆN HÀNH; ca "mồ côi" ⇒ batDau/ketThuc null', async () => {
    const { doctor, branch, token } = await setup();
    await fx.admin.shift(doctor.profile, { ngay: MON, ca: 'CaSang' });
    await fx.admin.shift(doctor.profile, { ngay: MON, ca: 'CaChieu' });
    await db.query(
      `UPDATE chi_nhanh_lich_hoat_dong SET gio_bat_dau_sang = '07:30:00', gio_bat_dau_chieu = NULL, gio_ket_thuc_chieu = NULL
        WHERE chi_nhanh_id = ? AND thu_trong_tuan = 1`,
      [branch.chiNhanhId],
    );
    const res = await get(week, token).expect(200);
    expect(res.body.ca).toMatchObject([
      { ca: 'CaSang', batDau: '07:30', ketThuc: '12:00', gioCaKhongCon: false },
      { ca: 'CaChieu', batDau: null, ketThuc: null, gioCaKhongCon: true },
    ]);
  });

  it('XL-16 Cache-Control no-store; không có email/SĐT', async () => {
    const { doctor, token } = await setup();
    await fx.admin.shift(doctor.profile, { ngay: MON, ca: 'CaSang' });
    const res = await get(week, token).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/@|email|soDienThoai/i);
  });

  it('XL-18 chưa có booking: không có trường soLichHen (không hiện "0 lịch" sai)', async () => {
    const { doctor, token } = await setup();
    await fx.admin.shift(doctor.profile, { ngay: MON, ca: 'CaSang' });
    const res = await get(week, token).expect(200);
    expect(res.body.ca[0]).not.toHaveProperty('soLichHen');
  });

  it('XL-20/QH-04 hai bác sĩ cùng chi nhánh: mỗi người chỉ thấy ca và yêu cầu nghỉ của mình', async () => {
    const { doctor, doctorId, branch, token } = await setup();
    const colleague = await fx.admin.doctor(branch);
    await fx.admin.shift(doctor.profile, { ngay: MON, ca: 'CaSang' });
    await fx.admin.shift(colleague.profile, {
      ngay: '2026-12-08',
      ca: 'CaSang',
    });
    await fx.leaveRequest({
      bacSiId: colleague.account.taiKhoanId,
      batDau: MON,
    });

    const mine = await get(week, token).expect(200);
    expect(mine.body.ca.map((s: { ngay: string }) => s.ngay)).toEqual([MON]);
    expect(mine.body.ca[0].nghiPhep).toBeNull(); // nghỉ phép của đồng nghiệp không chặn ca của mình
    expect(mine.body.nghiPhep).toEqual([]);

    const theirs = await get(
      week,
      await tokenOf(colleague.account.taiKhoanId),
    ).expect(200);
    expect(theirs.body.ca.map((s: { ngay: string }) => s.ngay)).toEqual([
      '2026-12-08',
    ]);
    expect(doctorId).not.toBe(colleague.account.taiKhoanId);
  });

  it('QH-04 không đăng nhập ⇒ 401; vai trò khác Bác sĩ (Lễ tân, Quản trị viên) ⇒ 403', async () => {
    const w = await setup();
    expectErrorResponse(
      await request(app.getHttpServer()).get(url).query(week),
      401,
      'CHUA_DANG_NHAP',
    );
    for (const account of [w.receptionist.account, w.systemAdmin.account])
      expectErrorResponse(
        await get(week, await tokenOf(account.taiKhoanId)),
        403,
        'KHONG_DU_QUYEN',
      );
  });
});
