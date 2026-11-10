import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { nowVN, todayVN } from '../src/common/time/time.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { LeaveNotifier } from '../src/doctor/notifications/leave-notifier.js';
import { DoctorFixtures } from '../src/doctor/testing/doctor-fixtures.js';
import {
  formatCalendarDate,
  parseCalendarDate,
} from '../src/scheduling/calendar-date.js';
import { AvailableSlotsReader } from '../src/scheduling/slots/available-slots.reader.js';

// Doctor B11 — POST /doctor/leave-requests qua HTTP thật + MySQL thật:
// YN-01, 02, 07, 08, 09, 10, 11, 12, 13, 14, 17, 18, 19, 20, 21, 22, DH-02, BD-02 (YN-03…06, 23 đã phủ ở leave-request.rules.spec.ts).
describe('B11 — tạo yêu cầu nghỉ phép', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: DoctorFixtures;
  let sessions: SessionService;

  // Ngày so với đồng hồ thật, để mọi ca luôn "chưa qua".
  const TODAY = todayVN(nowVN());
  const day = (offset: number) =>
    formatCalendarDate((parseCalendarDate(TODAY) as number) + offset);
  const REASON = 'Lý do riêng tư không được lộ ra';

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
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  afterAll(async () => app?.close());

  const tokenOf = async (accountId: string) =>
    (await sessions.create(accountId)).accessToken;
  const post = (body: unknown, token: string) =>
    request(app.getHttpServer())
      .post('/doctor/leave-requests')
      .auth(token, { type: 'bearer' })
      .send(body as object);
  const count = async (table: string) =>
    Number((await db.query(`SELECT COUNT(*) AS so FROM ${table}`))[0].so);
  const caNgay = (tuNgay: string, denNgay = tuNgay) => ({
    hinhThuc: 'CaNgay',
    tuNgay,
    denNgay,
    lyDo: REASON,
  });
  const theoCa = (ngay: string, ca: 'CaSang' | 'CaChieu') => ({
    hinhThuc: 'TheoCa',
    tuNgay: ngay,
    denNgay: ngay,
    ca,
    lyDo: REASON,
  });

  /** Thế giới + token Bác sĩ; mỗi ngày trong `days` có ca sáng và ca chiều. */
  async function setup(days: number[] = [5]) {
    const world = await fx.world();
    const doctorId = world.doctor.account.taiKhoanId;
    for (const offset of days) {
      for (const ca of ['CaSang', 'CaChieu'] as const)
        await fx.shiftWithSlots(world.doctor.profile, {
          ngay: day(offset),
          ca,
        });
    }
    return { ...world, doctorId, token: await tokenOf(doctorId) };
  }

  it('YN-01 TheoCa một ngày có ca: 201 ChoDuyet, thông báo cho Bác sĩ và Admin, khung giờ không đổi trạng thái', async () => {
    const w = await setup();
    const res = await post(theoCa(day(5), 'CaSang'), w.token).expect(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      yeuCauNghiPhepId: expect.stringMatching(/^\d+$/),
      trangThai: 'ChoDuyet',
      hinhThuc: 'TheoCa',
      tuNgay: day(5),
      denNgay: day(5),
      ca: 'CaSang',
      soCaBiAnhHuong: 1,
    });
    const [row] = await db.query(
      `SELECT trang_thai, bac_si_id, nguoi_xu_ly_id, ly_do FROM yeu_cau_nghi_phep`,
    );
    expect(row).toMatchObject({
      trang_thai: 'ChoDuyet',
      nguoi_xu_ly_id: null,
      ly_do: REASON,
    });
    expect(String(row.bac_si_id)).toBe(w.doctorId);

    const notes: { who: string; type: string; body: string }[] = await db.query(
      `SELECT CAST(tai_khoan_id AS CHAR) AS who, loai_su_kien AS type, noi_dung AS body FROM thong_bao ORDER BY thong_bao_id`,
    );
    const byType = new Map(notes.map((n) => [n.type, n]));
    expect(byType.get('NghiPhepDaGui')?.who).toBe(w.doctorId);
    // Admin Toàn hệ thống và Admin Chi nhánh đúng chi nhánh đều nhận (TYN b6).
    const adminIds = notes
      .filter((n) => n.type === 'NghiPhepChoDuyet')
      .map((n) => n.who)
      .sort();
    expect(adminIds).toEqual(
      [
        w.systemAdmin.account.taiKhoanId,
        w.branchAdmin.account.taiKhoanId,
      ].sort(),
    );
    for (const n of notes) expect(n.body).not.toContain(REASON);
    const states = await db.query(`SELECT DISTINCT trang_thai FROM khung_gio`);
    expect(states).toEqual([{ trang_thai: 'ConTrong' }]);
  });

  it('YN-02 CaNgay nhiều ngày có ca: 201 và đếm đủ ca bị ảnh hưởng', async () => {
    const w = await setup([5, 6]);
    const res = await post(caNgay(day(5), day(6)), w.token).expect(201);
    expect(res.body).toMatchObject({
      hinhThuc: 'CaNgay',
      ca: null,
      soCaBiAnhHuong: 4,
    });
  });

  it('YN-07 ngày / ca không thuộc lịch phân công ⇒ 409 NGHI_NGOAI_LICH_LAM_VIEC', async () => {
    const w = await setup([5]);
    for (const body of [caNgay(day(9)), theoCa(day(9), 'CaSang')])
      expectErrorResponse(
        await post(body, w.token),
        409,
        'NGHI_NGOAI_LICH_LAM_VIEC',
      );
    // Ca chiều có, nhưng ngày khác thì không.
    expect(await count('yeu_cau_nghi_phep')).toBe(0);
  });

  it('YN-08 CaNgay nhiều ngày chỉ một phần có ca: 201, soCaBiAnhHuong chỉ đếm ca có thật (Q20)', async () => {
    const w = await setup([5]);
    const res = await post(caNgay(day(4), day(8)), w.token).expect(201);
    expect(res.body.soCaBiAnhHuong).toBe(2);
  });

  it('YN-09 chồng nhau: ba kiểu bị 409 YEU_CAU_NGHI_TRUNG (không lộ lý do), hai kiểu thành công, yêu cầu TuChoi không chặn', async () => {
    const w = await setup([5, 6, 7]);
    await post(caNgay(day(5), day(6)), w.token).expect(201);
    // CaNgay × CaNgay giao ngày; TheoCa nằm trong CaNgay đã có.
    for (const body of [caNgay(day(6), day(7)), theoCa(day(5), 'CaChieu')]) {
      const error = expectErrorResponse(
        await post(body, w.token),
        409,
        'YEU_CAU_NGHI_TRUNG',
      );
      expect(JSON.stringify(error)).not.toContain(REASON);
    }
    // TheoCa cùng ca cùng ngày với một TheoCa có sẵn ⇒ trùng; khác ca ⇒ được.
    await post(theoCa(day(7), 'CaSang'), w.token).expect(201);
    expectErrorResponse(
      await post(theoCa(day(7), 'CaSang'), w.token),
      409,
      'YEU_CAU_NGHI_TRUNG',
    );
    await post(theoCa(day(7), 'CaChieu'), w.token).expect(201);
    // Yêu cầu đã bị từ chối không chặn.
    await fx.leaveRequest({
      bacSiId: w.doctorId,
      batDau: day(8),
      trangThai: 'TuChoi',
      nguoiXuLyId: w.systemAdmin.account.taiKhoanId,
      thoiDiemXuLy: '2026-12-01 08:00:00',
    });
    await fx.shiftWithSlots(w.doctor.profile, { ngay: day(8), ca: 'CaSang' });
    await post(caNgay(day(8)), w.token).expect(201);
  });

  it('YN-10 khoảng 32 ngày; quá 90 ngày tới; 6 yêu cầu chờ', async () => {
    const w = await setup([5]);
    expectErrorResponse(
      await post(caNgay(day(5), day(36)), w.token),
      409,
      'KHOANG_NGHI_QUA_DAI',
    );
    expectErrorResponse(
      await post(caNgay(day(91)), w.token),
      409,
      'NGHI_QUA_XA',
    );
    expectErrorResponse(
      await post(caNgay(day(-1)), w.token),
      409,
      'NGAY_NGHI_DA_QUA',
    );
    for (let i = 0; i < 5; i += 1)
      await fx.leaveRequest({ bacSiId: w.doctorId, batDau: day(20 + i) });
    expectErrorResponse(
      await post(caNgay(day(5)), w.token),
      409,
      'QUA_NHIEU_YEU_CAU_CHO_DUYET',
    );
    expect(await count('yeu_cau_nghi_phep')).toBe(5);
  });

  it('YN-21 biên: 31 ngày liên tiếp, đúng ngày thứ 90, và yêu cầu chờ thứ 5 đều được nhận', async () => {
    const w = await setup([5, 90]);
    await post(caNgay(day(5), day(35)), w.token).expect(201);
    await post(theoCa(day(90), 'CaSang'), w.token).expect(201);
    for (let i = 0; i < 2; i += 1)
      await fx.leaveRequest({ bacSiId: w.doctorId, batDau: day(50 + i) });
    // Đã có 4 yêu cầu chờ (2 vừa tạo + 2 chèn): yêu cầu thứ 5 vẫn được.
    await post(theoCa(day(90), 'CaChieu'), w.token).expect(201);
    expect(await count('yeu_cau_nghi_phep')).toBe(5);
  });

  it('YN-11 TheoCa hôm nay: ca sáng lúc 10:00 được nhận, lúc 14:00 ⇒ CA_DA_KET_THUC', async () => {
    const w = await fx.world();
    await fx.shiftWithSlots(w.doctor.profile, { ngay: TODAY, ca: 'CaSang' });
    vi.useFakeTimers({ toFake: ['Date'] });

    vi.setSystemTime(new Date(`${TODAY}T14:00:00+07:00`));
    const lateToken = await tokenOf(w.doctor.account.taiKhoanId);
    expectErrorResponse(
      await post(theoCa(TODAY, 'CaSang'), lateToken),
      409,
      'CA_DA_KET_THUC',
    );

    vi.setSystemTime(new Date(`${TODAY}T10:00:00+07:00`));
    const earlyToken = await tokenOf(w.doctor.account.taiKhoanId);
    await post(theoCa(TODAY, 'CaSang'), earlyToken).expect(201);
  });

  it('YN-12 gửi bacSiId ⇒ 400 TRUONG_KHONG_DUOC_PHEP và không ghi gì', async () => {
    const w = await setup();
    const other = await fx.admin.doctor(w.branch);
    const res = await post(
      { ...caNgay(day(5)), bacSiId: other.account.taiKhoanId },
      w.token,
    );
    const body = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
    expect(body.loi).toContainEqual({
      truong: 'bacSiId',
      ma: 'TRUONG_KHONG_DUOC_PHEP',
    });
    expect(await count('yeu_cau_nghi_phep')).toBe(0);
  });

  it('YN-13 Lễ tân, Bệnh nhân, Quản trị viên ⇒ 403; chưa đăng nhập ⇒ 401', async () => {
    const w = await setup();
    const patient = await fx.admin.patient();
    for (const accountId of [
      w.receptionist.account.taiKhoanId,
      patient.account.taiKhoanId,
      w.systemAdmin.account.taiKhoanId,
    ])
      expectErrorResponse(
        await post(caNgay(day(5)), await tokenOf(accountId)),
        403,
        'KHONG_DU_QUYEN',
      );
    expectErrorResponse(
      await request(app.getHttpServer())
        .post('/doctor/leave-requests')
        .send(caNgay(day(5))),
      401,
      'CHUA_DANG_NHAP',
    );
    expect(await count('yeu_cau_nghi_phep')).toBe(0);
  });

  it('YN-14 hai lần gửi giống hệt liên tiếp: lần hai YEU_CAU_NGHI_TRUNG', async () => {
    const w = await setup();
    await post(caNgay(day(5)), w.token).expect(201);
    expectErrorResponse(
      await post(caNgay(day(5)), w.token),
      409,
      'YEU_CAU_NGHI_TRUNG',
    );
    expect(await count('yeu_cau_nghi_phep')).toBe(1);
  });

  it('DH-02 hai yêu cầu giống nhau gửi ĐỒNG THỜI: đúng một thành công', async () => {
    const w = await setup();
    const results = await Promise.all([
      post(caNgay(day(5)), w.token),
      post(caNgay(day(5)), w.token),
    ]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    const loser = results.find((r) => r.status === 409);
    expectErrorResponse(loser!, 409, 'YEU_CAU_NGHI_TRUNG');
    expect(await count('yeu_cau_nghi_phep')).toBe(1);
    // Mỗi sự kiện chỉ được ghi một lần: chỉ yêu cầu thắng có thông báo.
    expect(await count(`thong_bao WHERE loai_su_kien = 'NghiPhepDaGui'`)).toBe(
      1,
    );
  });

  it('YN-17 sau khi tạo ChoDuyet, khung giờ của ngày bị loại khỏi danh sách còn trống (AV)', async () => {
    const w = await setup();
    const reader = app.get(AvailableSlotsReader);
    const before = await reader.list({ bacSiId: w.doctorId, ngay: day(5) });
    expect(before.khungGio.length).toBeGreaterThan(0);
    await post(caNgay(day(5)), w.token).expect(201);
    const after = await reader.list({ bacSiId: w.doctorId, ngay: day(5) });
    expect(after.trangThaiNgay).toBe('NghiPhep');
    expect(after.khungGio).toEqual([]);
  });

  it('YN-18 lỗi ghi thông báo ⇒ hoàn tác cả yêu cầu', async () => {
    const w = await setup();
    vi.spyOn(app.get(LeaveNotifier), 'notify').mockRejectedValueOnce(
      new Error('thong_bao hỏng'),
    );
    expectErrorResponse(
      await post(caNgay(day(5)), w.token),
      500,
      'LOI_HE_THONG',
    );
    expect(await count('yeu_cau_nghi_phep')).toBe(0);
    expect(await count('thong_bao')).toBe(0);
  });

  it('YN-19 phản hồi lỗi và thành công không chứa lý do nghỉ', async () => {
    const w = await setup();
    const created = await post(caNgay(day(5)), w.token).expect(201);
    expect(JSON.stringify(created.body)).not.toContain(REASON);
    const duplicate = await post(caNgay(day(5)), w.token);
    expect(JSON.stringify(duplicate.body)).not.toContain(REASON);
    const invalid = await post({ ...caNgay(day(5)), lyDo: 'x' }, w.token);
    expectErrorResponse(invalid, 400, 'DU_LIEU_KHONG_HOP_LE');
  });

  it('YN-20 không có route huỷ yêu cầu (Q23)', async () => {
    const w = await setup();
    const id = await fx.leaveRequest({ bacSiId: w.doctorId, batDau: day(5) });
    for (const method of ['delete', 'patch', 'put'] as const)
      expectErrorResponse(
        await request(app.getHttpServer())
          [method](`/doctor/leave-requests/${id}`)
          .auth(w.token, { type: 'bearer' }),
        404,
        'KHONG_TIM_THAY',
      );
  });

  it('YN-22 chưa nối booking: phản hồi không có soLichHenDangCo', async () => {
    const w = await setup();
    const res = await post(caNgay(day(5)), w.token).expect(201);
    expect(res.body).not.toHaveProperty('soLichHenDangCo');
  });

  it('BD-02 lỗi kiểm dữ liệu có đúng hình dạng chuẩn và loi[] theo trường', async () => {
    const w = await setup();
    const res = await post(
      { hinhThuc: 'TheoCa', tuNgay: day(5), denNgay: day(6), lyDo: ' ' },
      w.token,
    );
    const body = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
    expect(body.loi).toEqual(
      expect.arrayContaining([
        { truong: 'ca', ma: 'CA_BAT_BUOC' },
        { truong: 'denNgay', ma: 'NGHI_THEO_CA_CHI_MOT_NGAY' },
        { truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' },
      ]),
    );
    const bad = await post(
      { hinhThuc: 'Khac', tuNgay: '2026-02-30', denNgay: 5 },
      w.token,
    );
    expect(expectErrorResponse(bad, 400, 'DU_LIEU_KHONG_HOP_LE').loi).toEqual(
      expect.arrayContaining([
        { truong: 'hinhThuc', ma: 'HINH_THUC_KHONG_HOP_LE' },
        { truong: 'tuNgay', ma: 'NGAY_KHONG_HOP_LE' },
        { truong: 'denNgay', ma: 'NGAY_KHONG_HOP_LE' },
        { truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' },
      ]),
    );
  });
});
