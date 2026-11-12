import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { nowVN, todayVN } from '../src/common/time/time.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { AFFECTED_PREVIEW_LIMIT } from '../src/doctor/leave-approval/admin-leave.constants.js';
import {
  APPOINTMENT_LEAVE_READ_PORT,
  type AppointmentLeaveReadPort,
} from '../src/doctor/leave-approval/appointment-leave-read.port.js';
import { DoctorFixtures } from '../src/doctor/testing/doctor-fixtures.js';
import {
  formatCalendarDate,
  parseCalendarDate,
} from '../src/scheduling/calendar-date.js';

// Doctor HD-06 (B17) — hình dạng tham số `doctor` gửi sang `booking` ở cổng ĐỌC (D13 `listAffected`, D14 `countByShifts`), kiểm bằng cổng GIẢ thay vào AppModule (`overrideProvider`)
// qua HTTP thật + MySQL thật: đúng khoá, `ca` chỉ có khi nghỉ theo ca, `now` là Date, `limit` đúng, TuChoi không hỏi booking, danh sách id ca đúng và đúng MỘT lần đếm mỗi phản hồi.
// Cộng ca "đọc booking lỗi": phản hồi tạo yêu cầu nghỉ vẫn 201 (yêu cầu đã commit), chỉ vắng `soLichHenDangCo`; không bao giờ trả 0 sai.
describe('HD-06 — cổng đọc D13/D14 của doctor sang booking (cổng giả)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: DoctorFixtures;
  let sessions: SessionService;
  const listAffected = vi.fn<AppointmentLeaveReadPort['listAffected']>();
  const countByShifts = vi.fn<AppointmentLeaveReadPort['countByShifts']>();

  const TODAY = todayVN(nowVN());
  const day = (offset: number) =>
    formatCalendarDate((parseCalendarDate(TODAY) as number) + offset);

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APPOINTMENT_LEAVE_READ_PORT)
      .useValue({ listAffected, countByShifts })
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    fx = new DoctorFixtures(db);
    sessions = app.get(SessionService);
  });
  beforeEach(async () => {
    await resetTables(db);
    listAffected.mockReset();
    countByShifts.mockReset();
    listAffected.mockResolvedValue({
      tong: 0,
      soBenhNhan: 0,
      soCoCoc: 0,
      items: [],
    });
    countByShifts.mockResolvedValue({});
  });
  afterAll(async () => app?.close());

  const tokenOf = async (accountId: string) =>
    (await sessions.create(accountId)).accessToken;
  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).auth(token, { type: 'bearer' });
  const post = (path: string, token: string, body: object) =>
    request(app.getHttpServer())
      .post(path)
      .auth(token, { type: 'bearer' })
      .send(body);

  async function setup() {
    const world = await fx.world();
    const doctorId = world.doctor.account.taiKhoanId;
    const shifts: Record<string, string> = {};
    for (const offset of [5, 6])
      for (const ca of ['CaSang', 'CaChieu'] as const)
        shifts[`${offset}-${ca}`] = (
          await fx.shiftWithSlots(world.doctor.profile, {
            ngay: day(offset),
            ca,
          })
        ).shift.lichLamViecId;
    return {
      ...world,
      doctorId,
      shifts,
      doctorToken: await tokenOf(doctorId),
      systemToken: await tokenOf(world.systemAdmin.account.taiKhoanId),
    };
  }

  it('HD-06 chi tiết Admin: listAffected nhận { bacSiId, tuNgay, denNgay, now: Date, limit } — nghỉ cả ngày KHÔNG có khoá ca, nghỉ theo ca có ca', async () => {
    const w = await setup();
    const whole = await fx.leaveRequest({
      bacSiId: w.doctorId,
      batDau: day(5),
      ketThuc: day(6),
    });
    const byShift = await fx.leaveRequest({
      bacSiId: w.doctorId,
      batDau: day(6),
      hinhThuc: 'TheoCa',
      ca: 'CaChieu',
      trangThai: 'DaDuyet',
      nguoiXuLyId: w.systemAdmin.account.taiKhoanId,
      thoiDiemXuLy: '2026-11-05 09:00:00',
    });

    await get(`/admin/leave-requests/${whole}`, w.systemToken).expect(200);
    const [wholeCall] = listAffected.mock.calls[0] ?? [];
    expect(Object.keys(wholeCall ?? {}).sort()).toEqual(
      ['bacSiId', 'denNgay', 'limit', 'now', 'tuNgay'].sort(),
    );
    expect(wholeCall).toMatchObject({
      bacSiId: w.doctorId,
      tuNgay: day(5),
      denNgay: day(6),
      limit: AFFECTED_PREVIEW_LIMIT,
    });
    expect(wholeCall?.now).toBeInstanceOf(Date);
    // `now` đã cắt xuống giây (một mốc cho cả phản hồi)
    expect(wholeCall?.now.getMilliseconds()).toBe(0);

    listAffected.mockClear();
    await get(`/admin/leave-requests/${byShift}`, w.systemToken).expect(200);
    expect(listAffected.mock.calls[0]?.[0]).toMatchObject({
      tuNgay: day(6),
      denNgay: day(6),
      ca: 'CaChieu',
      limit: AFFECTED_PREVIEW_LIMIT,
    });
  });

  it('HD-06 danh sách Admin: mỗi dòng ChoDuyet/DaDuyet một lần hỏi với limit = 0 (chỉ đếm); TuChoi không hỏi booking', async () => {
    const w = await setup();
    await fx.leaveRequest({ bacSiId: w.doctorId, batDau: day(5) });
    await fx.leaveRequest({
      bacSiId: w.doctorId,
      batDau: day(6),
      trangThai: 'DaDuyet',
      nguoiXuLyId: w.systemAdmin.account.taiKhoanId,
      thoiDiemXuLy: '2026-11-05 09:00:00',
    });
    await fx.leaveRequest({
      bacSiId: w.doctorId,
      batDau: day(7),
      trangThai: 'TuChoi',
      nguoiXuLyId: w.systemAdmin.account.taiKhoanId,
      thoiDiemXuLy: '2026-11-05 09:00:00',
    });
    listAffected.mockResolvedValue({
      tong: 4,
      soBenhNhan: 2,
      soCoCoc: 1,
      items: [],
    });

    const res = await get('/admin/leave-requests', w.systemToken).expect(200);
    expect(listAffected).toHaveBeenCalledTimes(2);
    for (const [input] of listAffected.mock.calls) expect(input.limit).toBe(0);
    const values = res.body.items.map(
      (i: { trangThai: string; soLichHenBiAnhHuong: number | null }) => [
        i.trangThai,
        i.soLichHenBiAnhHuong,
      ],
    );
    // Thứ tự dòng không quan trọng ở ca này: chỉ cần đủ ba dòng với đúng giá trị
    expect(values).toHaveLength(3);
    expect(values).toEqual(
      expect.arrayContaining([
        ['ChoDuyet', 4],
        ['DaDuyet', 4],
        ['TuChoi', null],
      ]),
    );
  });

  it('HD-06 lưới Bác sĩ: đúng MỘT lần countByShifts với đúng mã các ca đang hiển thị (lọc ca ⇒ chỉ ca đó), và soLichHen lấy từ kết quả', async () => {
    const w = await setup();
    countByShifts.mockImplementation(async (ids) =>
      Object.fromEntries(ids.map((id) => [id, 7])),
    );
    const res = await get(
      `/doctor/schedule?tuNgay=${day(5)}&denNgay=${day(6)}&ca=CaSang`,
      w.doctorToken,
    ).expect(200);
    expect(countByShifts).toHaveBeenCalledTimes(1);
    expect([...(countByShifts.mock.calls[0]?.[0] ?? [])].sort()).toEqual(
      [w.shifts[`5-CaSang`], w.shifts[`6-CaSang`]].sort(),
    );
    expect(res.body.ca.map((s: { soLichHen: number }) => s.soLichHen)).toEqual([
      7, 7,
    ]);
  });

  it('HD-06 lưới Admin: đúng một lần countByShifts cho mọi ca của trang; ca không có khoá trong kết quả ⇒ 0', async () => {
    const w = await setup();
    countByShifts.mockResolvedValue({ [w.shifts['5-CaSang'] as string]: 2 });
    const res = await get(
      `/admin/doctor-shifts?tuNgay=${day(5)}&denNgay=${day(6)}`,
      w.systemToken,
    ).expect(200);
    expect(countByShifts).toHaveBeenCalledTimes(1);
    expect(countByShifts.mock.calls[0]?.[0]).toHaveLength(4);
    const shifts = res.body.items.flatMap(
      (d: { ca: { lichLamViecId: string; soLichHen: number }[] }) => d.ca,
    );
    const counts = Object.fromEntries(
      shifts.map((s: { lichLamViecId: string; soLichHen: number }) => [
        s.lichLamViecId,
        s.soLichHen,
      ]),
    );
    expect(counts[w.shifts['5-CaSang'] as string]).toBe(2);
    expect(counts[w.shifts['6-CaChieu'] as string]).toBe(0);
  });

  it('HD-06 tạo yêu cầu nghỉ: countByShifts nhận mã các ca bị phủ và soLichHenDangCo là TỔNG', async () => {
    const w = await setup();
    countByShifts.mockImplementation(async (ids) =>
      Object.fromEntries(ids.map((id, i) => [id, i + 1])),
    );
    const res = await post('/doctor/leave-requests', w.doctorToken, {
      hinhThuc: 'CaNgay',
      tuNgay: day(5),
      denNgay: day(5),
      lyDo: 'Việc gia đình',
    }).expect(201);
    expect([...(countByShifts.mock.calls[0]?.[0] ?? [])].sort()).toEqual(
      [w.shifts['5-CaSang'], w.shifts['5-CaChieu']].sort(),
    );
    expect(res.body.soCaBiAnhHuong).toBe(2);
    expect(res.body.soLichHenDangCo).toBe(3); // 1 + 2
  });

  it('đọc booking LỖI khi tạo: vẫn 201 và yêu cầu đã được tạo, chỉ vắng soLichHenDangCo (không trả 0 sai, không 500)', async () => {
    const w = await setup();
    countByShifts.mockRejectedValue(new Error('booking tạm lỗi'));
    const res = await post('/doctor/leave-requests', w.doctorToken, {
      hinhThuc: 'CaNgay',
      tuNgay: day(5),
      denNgay: day(5),
      lyDo: 'Việc gia đình',
    }).expect(201);
    expect(res.body).not.toHaveProperty('soLichHenDangCo');
    const [{ so }] = await db.query(
      `SELECT COUNT(*) AS so FROM yeu_cau_nghi_phep`,
    );
    expect(Number(so)).toBe(1);
  });

  it('HD-06 chi tiết của Bác sĩ: chỉ các ca TỪ HÔM NAY và đúng ca (TheoCa); TuChoi không hỏi booking và không có trường', async () => {
    const w = await setup();
    // Ca ở quá khứ không được đếm (bước huỷ của Duyệt không đụng lịch đã qua giờ)
    const pastShift = (
      await fx.shiftWithSlots(w.doctor.profile, { ngay: day(-2), ca: 'CaSang' })
    ).shift.lichLamViecId;
    const wide = await fx.leaveRequest({
      bacSiId: w.doctorId,
      batDau: day(-2),
      ketThuc: day(5),
    });
    const byShift = await fx.leaveRequest({
      bacSiId: w.doctorId,
      batDau: day(6),
      hinhThuc: 'TheoCa',
      ca: 'CaChieu',
    });
    const rejected = await fx.leaveRequest({
      bacSiId: w.doctorId,
      batDau: day(-9),
      trangThai: 'TuChoi',
      nguoiXuLyId: w.systemAdmin.account.taiKhoanId,
      thoiDiemXuLy: '2026-11-05 09:00:00',
    });
    countByShifts.mockImplementation(async (ids) =>
      Object.fromEntries(ids.map((id) => [id, 1])),
    );

    const one = await get(
      `/doctor/leave-requests/${wide}`,
      w.doctorToken,
    ).expect(200);
    const ids = countByShifts.mock.calls[0]?.[0] ?? [];
    expect(ids).not.toContain(pastShift);
    expect([...ids].sort()).toEqual(
      [w.shifts['5-CaSang'], w.shifts['5-CaChieu']].sort(),
    );
    expect(one.body.soLichHenDangCo).toBe(2);

    countByShifts.mockClear();
    const two = await get(
      `/doctor/leave-requests/${byShift}`,
      w.doctorToken,
    ).expect(200);
    expect(countByShifts.mock.calls[0]?.[0]).toEqual([w.shifts['6-CaChieu']]);
    expect(two.body.soLichHenDangCo).toBe(1);

    countByShifts.mockClear();
    const three = await get(
      `/doctor/leave-requests/${rejected}`,
      w.doctorToken,
    ).expect(200);
    expect(countByShifts).not.toHaveBeenCalled();
    expect(three.body).not.toHaveProperty('soLichHenDangCo');
  });

  it('Duyệt và Xử lý lại KHÔNG dùng cổng đọc (chỉ cổng huỷ): HD-06 không có lời gọi đọc nào ngoài hiển thị', async () => {
    const w = await setup();
    const id = await fx.leaveRequest({ bacSiId: w.doctorId, batDau: day(5) });
    await post(`/admin/leave-requests/${id}/approve`, w.systemToken, {}).expect(
      200,
    );
    await post(
      `/admin/leave-requests/${id}/retry-cancellations`,
      w.systemToken,
      {},
    ).expect(200);
    expect(listAffected).not.toHaveBeenCalled();
    expect(countByShifts).not.toHaveBeenCalled();
  });
});
