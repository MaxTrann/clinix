import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { BookingFixtures } from '../src/appointments/testing/booking-fixtures.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { nowVN, todayVN } from '../src/common/time/time.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { DoctorFixtures } from '../src/doctor/testing/doctor-fixtures.js';
import { assertInvariants } from '../src/doctor/testing/invariants.js';
import {
  formatCalendarDate,
  parseCalendarDate,
} from '../src/scheduling/calendar-date.js';

// Doctor UX7 (issue #582) — yêu cầu nghỉ THEO CA nhiều ngày qua HTTP thật + MySQL thật. Phía tạo: DUX7-06 đến 09 (hạn), DUX7-56 (ca đã kết thúc hôm nay), DUX7-23 đến 26 (tạo, ngoài lịch,
// chồng khoảng, bất biến), DUX7-55 (lưới lịch Bác sĩ và Lễ tân), DUX7-33 (đua). Duyệt, từ chối, thử lại, sweeper, đếm lịch hẹn: src/doctor/leave-approval/admin-leave-multi-day.int-spec.ts.
describe('DUX7 — tạo yêu cầu nghỉ theo ca nhiều ngày', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: DoctorFixtures;
  let sessions: SessionService;

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
  const get = (path: string, query: Record<string, string>, token: string) =>
    request(app.getHttpServer())
      .get(path)
      .query(query)
      .auth(token, { type: 'bearer' });
  const count = async (table: string) =>
    Number((await db.query(`SELECT COUNT(*) AS so FROM ${table}`))[0].so);
  const theoCa = (
    tuNgay: string,
    denNgay: string,
    ca: 'CaSang' | 'CaChieu',
  ) => ({ hinhThuc: 'TheoCa', tuNgay, denNgay, ca, lyDo: REASON });
  const caNgay = (tuNgay: string, denNgay = tuNgay) => ({
    hinhThuc: 'CaNgay',
    tuNgay,
    denNgay,
    lyDo: REASON,
  });

  /** Thế giới + token Bác sĩ; mỗi ngày trong `days` có ca sáng và ca chiều (hoặc chỉ các ca trong `only`). */
  async function setup(
    days: number[] = [5, 7, 9],
    only: ('CaSang' | 'CaChieu')[] = ['CaSang', 'CaChieu'],
  ) {
    const world = await fx.world();
    const doctorId = world.doctor.account.taiKhoanId;
    for (const offset of days)
      for (const ca of only)
        await fx.shiftWithSlots(world.doctor.profile, {
          ngay: day(offset),
          ca,
        });
    return { ...world, doctorId, token: await tokenOf(doctorId) };
  }

  it('DUX7-23 TheoCa nhiều ngày chỉ một phần có ca: 201, soCaBiAnhHuong đếm đúng (ngày, ca) có thật, soLichHenDangCo chỉ tính lịch ở ca đó; ngày không có ca bị bỏ qua (T3)', async () => {
    const w = await setup([5, 7, 9]); // khoảng 5 đến 9: ngày 6 và 8 không có ca
    const bookings = new BookingFixtures(db);
    const patientId = (await fx.admin.patient()).account.taiKhoanId;
    const firstSlot = async (ngay: string, ca: 'CaSang' | 'CaChieu') =>
      String(
        (
          await db.query(
            `SELECT k.khung_gio_id AS id FROM khung_gio k JOIN lich_lam_viec l ON l.lich_lam_viec_id = k.lich_lam_viec_id
              WHERE l.ngay = ? AND l.ca = ? ORDER BY k.ngay_gio LIMIT 1`,
            [ngay, ca],
          )
        )[0].id,
      );
    const book = async (ngay: string, ca: 'CaSang' | 'CaChieu') =>
      bookings.appointmentIn('DaXacNhan', {
        doctor: w.doctor.profile,
        khungGioId: await firstSlot(ngay, ca),
        patientId,
      });
    await book(day(5), 'CaSang');
    await book(day(7), 'CaSang');
    await book(day(7), 'CaChieu'); // CA KHÁC cùng ngày: không tính
    await book(day(9), 'CaChieu'); // CA KHÁC: không tính

    const res = await post(theoCa(day(5), day(9), 'CaSang'), w.token).expect(
      201,
    );
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      yeuCauNghiPhepId: expect.stringMatching(/^\d+$/),
      trangThai: 'ChoDuyet',
      hinhThuc: 'TheoCa',
      tuNgay: day(5),
      denNgay: day(9),
      ca: 'CaSang',
      soCaBiAnhHuong: 3, // sáng của ngày 5, 7, 9
      soLichHenDangCo: 2, // sáng 5 và sáng 7; hai lịch buổi chiều không tính
    });
    const [row] = await db.query(
      `SELECT hinh_thuc_nghi AS kind, ca, DATE_FORMAT(ngay_bat_dau, '%Y-%m-%d') AS tu, DATE_FORMAT(ngay_ket_thuc, '%Y-%m-%d') AS den, ly_do AS lyDo FROM yeu_cau_nghi_phep`,
    );
    expect(row).toEqual({
      kind: 'TheoCa',
      ca: 'CaSang',
      tu: day(5),
      den: day(9),
      lyDo: REASON,
    });
    // Phản hồi và thông báo không lộ lý do; thông báo giữ chữ ca cho cả khoảng
    const notes: { body: string }[] = await db.query(
      `SELECT noi_dung AS body FROM thong_bao ORDER BY thong_bao_id`,
    );
    expect(notes.length).toBeGreaterThanOrEqual(2);
    for (const note of notes) {
      expect(note.body).not.toContain(REASON);
      expect(note.body).toContain('ca sáng từ');
    }
  });

  it('DUX7-24 không có (ngày, ca) nào trong khoảng ⇒ 409 NGHI_NGOAI_LICH_LAM_VIEC, kể cả khi ngày nào cũng có CA KIA; một ngày không có ca đó cũng vậy', async () => {
    const w = await setup([5, 7, 9], ['CaChieu']); // chỉ có ca chiều
    expectErrorResponse(
      await post(theoCa(day(5), day(9), 'CaSang'), w.token),
      409,
      'NGHI_NGOAI_LICH_LAM_VIEC',
    );
    // Khoảng chỉ rơi vào ngày không có ca nào
    expectErrorResponse(
      await post(theoCa(day(10), day(14), 'CaChieu'), w.token),
      409,
      'NGHI_NGOAI_LICH_LAM_VIEC',
    );
    expect(await count('yeu_cau_nghi_phep')).toBe(0);
    // Chiều thì được
    await post(theoCa(day(5), day(9), 'CaChieu'), w.token).expect(201);
  });

  it('DUX7-25 chồng khoảng: cùng ca giao ngày (kể cả chạm một ngày) ⇒ 409 YEU_CAU_NGHI_TRUNG không lộ lý do; khác ca, ngoài khoảng, hay yêu cầu TuChoi ⇒ nhận; CaNgay giao ⇒ trùng', async () => {
    const w = await setup([5, 6, 7, 8, 9, 10, 11, 12]);
    await post(theoCa(day(5), day(8), 'CaSang'), w.token).expect(201);
    for (const body of [
      theoCa(day(7), day(10), 'CaSang'), // giao giữa
      theoCa(day(8), day(9), 'CaSang'), // chạm đúng ngày cuối
      theoCa(day(5), day(5), 'CaSang'), // một ngày ở đầu
      caNgay(day(8), day(9)), // CaNgay phủ cả hai ca
    ]) {
      const error = expectErrorResponse(
        await post(body, w.token),
        409,
        'YEU_CAU_NGHI_TRUNG',
      );
      expect(JSON.stringify(error)).not.toContain(REASON);
    }
    await post(theoCa(day(7), day(10), 'CaChieu'), w.token).expect(201); // khác ca
    await post(theoCa(day(9), day(11), 'CaSang'), w.token).expect(201); // liền sau, không giao ngày
    // Yêu cầu đã bị từ chối không chặn
    await fx.leaveRequest({
      bacSiId: w.doctorId,
      hinhThuc: 'TheoCa',
      ca: 'CaSang',
      batDau: day(12),
      ketThuc: day(12),
      trangThai: 'TuChoi',
      nguoiXuLyId: w.systemAdmin.account.taiKhoanId,
      thoiDiemXuLy: '2026-12-01 08:00:00',
    });
    await post(theoCa(day(12), day(12), 'CaSang'), w.token).expect(201);
    await assertInvariants(db, TODAY); // IV-04: không có hai yêu cầu chặn nhau
  });

  it('DUX7-06..09 hạn của khoảng cho TheoCa: 31 ngày nhận, 32 ngày KHOANG_NGHI_QUA_DAI; hôm nay + 90 nhận, + 91 NGHI_QUA_XA; hôm qua NGAY_NGHI_DA_QUA; trần 5 yêu cầu chờ tính theo yêu cầu', async () => {
    const w = await setup([5, 35, 90]);
    expectErrorResponse(
      await post(theoCa(day(5), day(36), 'CaSang'), w.token),
      409,
      'KHOANG_NGHI_QUA_DAI',
    );
    expectErrorResponse(
      await post(theoCa(day(91), day(91), 'CaSang'), w.token),
      409,
      'NGHI_QUA_XA',
    );
    expectErrorResponse(
      await post(theoCa(day(-1), day(3), 'CaSang'), w.token),
      409,
      'NGAY_NGHI_DA_QUA',
    );
    expect(await count('yeu_cau_nghi_phep')).toBe(0);
    // Biên: đúng 31 ngày (5 đến 35), và đúng ngày thứ 90
    await post(theoCa(day(5), day(35), 'CaSang'), w.token).expect(201);
    await post(theoCa(day(90), day(90), 'CaSang'), w.token).expect(201);
    expect(await count('yeu_cau_nghi_phep')).toBe(2);
  });

  it('DUX7-26 trần chờ duyệt đếm theo YÊU CẦU: một yêu cầu nhiều ngày chỉ là một; yêu cầu thứ 6 bị từ chối', async () => {
    const w = await setup([5, 6, 7, 8, 9, 10]);
    for (const offset of [5, 6, 7, 8, 9])
      await post(theoCa(day(offset), day(offset), 'CaSang'), w.token).expect(
        201,
      );
    expectErrorResponse(
      await post(theoCa(day(5), day(10), 'CaChieu'), w.token),
      409,
      'QUA_NHIEU_YEU_CAU_CHO_DUYET',
    );
    expect(await count('yeu_cau_nghi_phep')).toBe(5);
  });

  it('DUX7-56 ca đã kết thúc hôm nay (e2e của DUX7-16): khoảng bắt đầu hôm nay có ca sáng lúc 14:00 ⇒ CA_DA_KET_THUC (như một ngày), lúc 10:00 ⇒ nhận; hôm nay không có ca đó, hay bắt đầu ngày mai ⇒ không kiểm', async () => {
    const w = await fx.world();
    await fx.shiftWithSlots(w.doctor.profile, { ngay: TODAY, ca: 'CaSang' });
    await fx.shiftWithSlots(w.doctor.profile, { ngay: day(2), ca: 'CaSang' });
    await fx.shiftWithSlots(w.doctor.profile, { ngay: day(3), ca: 'CaChieu' });
    vi.useFakeTimers({ toFake: ['Date'] });

    vi.setSystemTime(new Date(`${TODAY}T14:00:00+07:00`));
    const lateToken = await tokenOf(w.doctor.account.taiKhoanId);
    // Hôm nay CÓ ca sáng và đã kết thúc: từ chối cả khoảng (dù ngày 2 còn ca sáng)
    expectErrorResponse(
      await post(theoCa(TODAY, day(3), 'CaSang'), lateToken),
      409,
      'CA_DA_KET_THUC',
    );
    // Hôm nay KHÔNG có ca chiều trong lịch: không kiểm giờ, nhận (ngày 3 có ca chiều)
    await post(theoCa(TODAY, day(3), 'CaChieu'), lateToken).expect(201);
    // Bắt đầu ngày mai: không bao giờ là "đã kết thúc", dù bây giờ là 14:00
    await post(theoCa(day(1), day(2), 'CaSang'), lateToken).expect(201);

    expect(await count('yeu_cau_nghi_phep')).toBe(2);
    // Cùng khoảng, lúc 10:00 ca sáng hôm nay chưa kết thúc: nhận
    await db.query('DELETE FROM yeu_cau_nghi_phep');
    vi.setSystemTime(new Date(`${TODAY}T10:00:00+07:00`));
    const earlyToken = await tokenOf(w.doctor.account.taiKhoanId);
    await post(theoCa(TODAY, day(3), 'CaSang'), earlyToken).expect(201);
  });

  it('DUX7-55 lưới lịch Bác sĩ và Lễ tân: ô nghỉ hiện đúng ca ở mọi ngày của khoảng (ChoDuyet, DaDuyet), ca kia và ngày ngoài khoảng không; nghiPhep[] không có lý do', async () => {
    const w = await setup([5, 6, 7]);
    await fx.leaveRequest({
      bacSiId: w.doctorId,
      hinhThuc: 'TheoCa',
      ca: 'CaSang',
      batDau: day(5),
      ketThuc: day(6),
      trangThai: 'DaDuyet',
      nguoiXuLyId: w.systemAdmin.account.taiKhoanId,
      thoiDiemXuLy: '2026-12-01 09:00:00',
    });
    await fx.leaveRequest({
      bacSiId: w.doctorId,
      hinhThuc: 'TheoCa',
      ca: 'CaChieu',
      batDau: day(6),
      ketThuc: day(7),
    }); // ChoDuyet
    const expected = [
      [day(5), 'CaSang', 'DaDuyet'],
      [day(5), 'CaChieu', null],
      [day(6), 'CaSang', 'DaDuyet'],
      [day(6), 'CaChieu', 'ChoDuyet'],
      [day(7), 'CaSang', null],
      [day(7), 'CaChieu', 'ChoDuyet'],
    ];
    const pick = (
      items: { ngay: string; ca: string; nghiPhep: string | null }[],
    ) => items.map((s) => [s.ngay, s.ca, s.nghiPhep]);
    const range = { tuNgay: day(4), denNgay: day(8) };

    const mine = await get('/doctor/schedule', range, w.token).expect(200);
    expect(pick(mine.body.ca)).toEqual(expected);
    expect(JSON.stringify(mine.body)).not.toContain(REASON);
    expect(mine.body.nghiPhep).toHaveLength(2);
    expect(mine.body.nghiPhep[0]).toMatchObject({
      hinhThuc: 'TheoCa',
      ca: 'CaSang',
      tuNgay: day(5),
      denNgay: day(6),
      trangThai: 'DaDuyet',
    });

    const reception = await get(
      '/reception/doctor-schedules',
      { ...range, bacSiId: w.doctorId },
      await tokenOf(w.receptionist.account.taiKhoanId),
    ).expect(200);
    expect(pick(reception.body.items[0].ca)).toEqual(expected);
  });

  it('DUX7-54 Admin xem danh sách và chi tiết yêu cầu "Theo ca" nhiều ngày: hình thức, khoảng, ca đúng; soLichHenBiAnhHuong chỉ đếm lịch ở ca đó (ca kia cùng ngày không tính); lý do chỉ ở chi tiết', async () => {
    const w = await setup([5, 6, 7]);
    const bookings = new BookingFixtures(db);
    const patientId = (await fx.admin.patient()).account.taiKhoanId;
    const book = async (ngay: string, ca: 'CaSang' | 'CaChieu') => {
      const [slot] = await db.query(
        `SELECT k.khung_gio_id AS id FROM khung_gio k JOIN lich_lam_viec l ON l.lich_lam_viec_id = k.lich_lam_viec_id
          WHERE l.ngay = ? AND l.ca = ? ORDER BY k.ngay_gio LIMIT 1`,
        [ngay, ca],
      );
      return bookings.appointmentIn('DaXacNhan', {
        doctor: w.doctor.profile,
        khungGioId: String(slot.id),
        patientId,
      });
    };
    await book(day(5), 'CaSang');
    await book(day(7), 'CaSang');
    await book(day(6), 'CaChieu'); // ca KHÁC cùng ngày trong khoảng: không tính
    const id = await fx.leaveRequest({
      bacSiId: w.doctorId,
      hinhThuc: 'TheoCa',
      ca: 'CaSang',
      batDau: day(5),
      ketThuc: day(7),
    });
    const token = await tokenOf(w.systemAdmin.account.taiKhoanId);

    const list = await get('/admin/leave-requests', {}, token).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      yeuCauNghiPhepId: id,
      hinhThuc: 'TheoCa',
      tuNgay: day(5),
      denNgay: day(7),
      ca: 'CaSang',
      soLichHenBiAnhHuong: 2,
    });
    const detail = await get(`/admin/leave-requests/${id}`, {}, token).expect(
      200,
    );
    expect(detail.body).toMatchObject({
      hinhThuc: 'TheoCa',
      ca: 'CaSang',
      soLichHenBiAnhHuong: 2,
      lichHenBiAnhHuong: { tong: 2, soBenhNhan: 1 },
    });
    expect(detail.body.lichHenBiAnhHuong.items).toHaveLength(2);
  });

  it('DUX7-33 đua: hai yêu cầu nhiều ngày CHỒNG khoảng cùng ca gửi đồng thời ⇒ đúng một thành công, bất biến IV-04 giữ; hai yêu cầu khác ca đồng thời ⇒ cả hai thành công', async () => {
    const w = await setup([5, 6, 7, 8]);
    const same = await Promise.all([
      post(theoCa(day(5), day(7), 'CaSang'), w.token),
      post(theoCa(day(6), day(8), 'CaSang'), w.token),
    ]);
    expect(same.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expectErrorResponse(
      same.find((r) => r.status === 409)!,
      409,
      'YEU_CAU_NGHI_TRUNG',
    );
    expect(await count('yeu_cau_nghi_phep')).toBe(1);
    expect(await count(`thong_bao WHERE loai_su_kien = 'NghiPhepDaGui'`)).toBe(
      1,
    );

    const sameAfternoon = await Promise.all([
      post(theoCa(day(5), day(8), 'CaChieu'), w.token),
      post(theoCa(day(6), day(8), 'CaChieu'), w.token),
    ]);
    expect(sameAfternoon.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    // Khác ca thì cùng thắng, dù khoảng ngày giống hệt
    await db.query('DELETE FROM yeu_cau_nghi_phep');
    const crossShift = await Promise.all([
      post(theoCa(day(5), day(8), 'CaSang'), w.token),
      post(theoCa(day(5), day(8), 'CaChieu'), w.token),
    ]);
    expect(crossShift.map((r) => r.status)).toEqual([201, 201]);
    await assertInvariants(db, TODAY);
  });
});
