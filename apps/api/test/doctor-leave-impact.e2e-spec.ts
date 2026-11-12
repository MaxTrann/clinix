import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { BookingFixtures } from '../src/appointments/testing/booking-fixtures.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { nowVN, todayVN } from '../src/common/time/time.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { AFFECTED_PREVIEW_LIMIT } from '../src/doctor/leave-approval/admin-leave.constants.js';
import {
  formatCalendarDate,
  parseCalendarDate,
} from '../src/scheduling/calendar-date.js';

// Doctor B17 — nối D13 vào chi tiết và danh sách yêu cầu nghỉ của Quản trị viên, qua HTTP thật + MySQL thật + booking THẬT (`AppointmentQueries.listAffectedByLeave`, B11):
// PD-20 (danh sách trắng, không email/SĐT), PD-22 (có số liệu khi yêu cầu còn hiệu lực; `TuChoi` ⇒ null), giới hạn `AFFECTED_PREVIEW_LIMIT` + `conNua`, và khớp với số lịch Duyệt huỷ thật (CG-14).
// Phần D14 (soLichHen ở lưới, soLichHenDangCo): doctor-schedule, doctor-leave-create, doctor-leave-history. Hình dạng tham số D5/D13/D14 (HD-06): doctor-read-port.e2e-spec.ts.
describe('B17 — hệ quả của yêu cầu nghỉ lên lịch hẹn (D13)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: BookingFixtures;
  let sessions: SessionService;

  const TODAY = todayVN(nowVN());
  const day = (offset: number) =>
    formatCalendarDate((parseCalendarDate(TODAY) as number) + offset);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    fx = new BookingFixtures(db);
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

  /** Ba ngày có ca sáng và ca chiều của một bác sĩ (day 5, 6, 7) và hai Bệnh nhân; `book` đặt lịch vào ô thứ `index` của danh sách ô theo thời gian. */
  async function setup() {
    const world = await fx.world({ ngay: day(5) });
    const doctor = world.doctor.profile;
    const slots: string[] = [...world.slotIds];
    for (const [offset, ca] of [
      [5, 'CaChieu'],
      [6, 'CaSang'],
      [6, 'CaChieu'],
      [7, 'CaSang'],
      [7, 'CaChieu'],
    ] as const)
      slots.push(
        ...(await fx.doctor.shiftWithSlots(doctor, { ngay: day(offset), ca }))
          .slotIds,
      );
    const second = await fx.admin.patient();
    const patients = [world.patient, second];
    return {
      ...world,
      doctorId: world.doctor.account.taiKhoanId,
      patients,
      systemToken: await tokenOf(world.systemAdmin.account.taiKhoanId),
      /** Đặt một lịch vào ô thứ `index` cho Bệnh nhân thứ `who` (0 hoặc 1) */
      book: (
        state: 'ChoThanhToan' | 'DaXacNhan' | 'DaTiepDon' | 'DaHuy',
        index: number,
        options: { who?: number; coc?: string } = {},
      ) =>
        fx.appointmentIn(state, {
          doctor,
          khungGioId: slots[index] as string,
          patientId: (patients[options.who ?? 0] ?? world.patient).account
            .taiKhoanId,
          ...(options.coc === undefined
            ? {}
            : { tienCocSnapshot: options.coc }),
        }),
      leave: (trangThai: 'ChoDuyet' | 'DaDuyet' | 'TuChoi', ngay = day(5)) =>
        fx.doctor.leaveRequest({
          bacSiId: world.doctor.account.taiKhoanId,
          batDau: ngay,
          ketThuc: day(7),
          trangThai,
          ...(trangThai === 'ChoDuyet'
            ? {}
            : {
                nguoiXuLyId: world.systemAdmin.account.taiKhoanId,
                thoiDiemXuLy: '2026-11-05 09:00:00',
              }),
        }),
    };
  }

  it('PD-20 chi tiết: tong, soBenhNhan (khác nhau), soCoCoc; items theo giờ hẹn; danh sách trắng, KHÔNG email, SĐT, lý do khám, id bệnh nhân', async () => {
    const w = await setup();
    await w.book('DaXacNhan', 3, { who: 0, coc: '50000.00' });
    await w.book('ChoThanhToan', 1, { who: 1 });
    await w.book('DaXacNhan', 2, { who: 0 });
    await w.book('DaTiepDon', 0, { who: 1 }); // đã tiếp đón: không bị huỷ nên không tính
    await w.book('DaHuy', 4, { who: 1 }); // đã huỷ: không tính
    const id = await w.leave('ChoDuyet');

    const res = await get(`/admin/leave-requests/${id}`, w.systemToken).expect(
      200,
    );
    const view = res.body.lichHenBiAnhHuong;
    expect(view).toMatchObject({
      tong: 3,
      soBenhNhan: 2,
      soCoCoc: 1,
      conNua: false,
    });
    expect(Object.keys(view).sort()).toEqual(
      ['conNua', 'items', 'soBenhNhan', 'soCoCoc', 'tong'].sort(),
    );
    expect(view.items).toHaveLength(3);
    for (const item of view.items) {
      expect(Object.keys(item).sort()).toEqual(
        [
          'maLichHen',
          'nguoiKham',
          'thoiGian',
          'tienCocSnapshot',
          'trangThai',
        ].sort(),
      );
      expect(Object.keys(item.nguoiKham)).toEqual(['hoTen']);
    }
    // Sắp theo giờ hẹn tăng dần
    const times: string[] = view.items.map(
      (i: { thoiGian: string }) => i.thoiGian,
    );
    expect([...times].sort((a, b) => a.localeCompare(b))).toEqual(times);
    expect(view.items.map((i: { trangThai: string }) => i.trangThai)).toEqual([
      'ChoThanhToan',
      'DaXacNhan',
      'DaXacNhan',
    ]);
    expect(res.body.soLichHenBiAnhHuong).toBe(3);

    // Không lộ liên hệ của Bệnh nhân ở BẤT KỲ chỗ nào của phản hồi
    const accounts: { email: string; so_dien_thoai: string }[] = await db.query(
      `SELECT email, so_dien_thoai FROM tai_khoan WHERE tai_khoan_id IN (?, ?)`,
      w.patients.map((p) => p.account.taiKhoanId),
    );
    const text = JSON.stringify(res.body);
    for (const account of accounts) {
      expect(text).not.toContain(account.email);
      expect(text).not.toContain(account.so_dien_thoai);
    }
    for (const forbidden of ['benhNhanId', 'lyDoKham', 'soDienThoai', 'email'])
      expect(text).not.toContain(forbidden);
  });

  it('PD-22 danh sách: yêu cầu ChoDuyet/DaDuyet có soLichHenBiAnhHuong; TuChoi là null (cả danh sách và chi tiết)', async () => {
    const w = await setup();
    await w.book('DaXacNhan', 0);
    await w.book('DaXacNhan', 1);
    const pending = await w.leave('ChoDuyet');
    const approved = await w.leave('DaDuyet', day(6));
    const rejected = await w.leave('TuChoi', day(7));

    const list = await get('/admin/leave-requests', w.systemToken).expect(200);
    const byId = Object.fromEntries(
      list.body.items.map(
        (i: {
          yeuCauNghiPhepId: string;
          soLichHenBiAnhHuong: number | null;
        }) => [i.yeuCauNghiPhepId, i.soLichHenBiAnhHuong],
      ),
    );
    // ChoDuyet khoảng day(5)..day(7) và DaDuyet day(6)..day(7): hai lịch ở day(5) chỉ thuộc yêu cầu đầu
    expect(byId[pending]).toBe(2);
    expect(byId[approved]).toBe(0);
    expect(byId[rejected]).toBeNull();

    const detail = await get(
      `/admin/leave-requests/${rejected}`,
      w.systemToken,
    ).expect(200);
    expect(detail.body.lichHenBiAnhHuong).toBeNull();
    expect(detail.body.soLichHenBiAnhHuong).toBeNull();
  });

  it(`giới hạn: tong là số thật nhưng items tối đa ${AFFECTED_PREVIEW_LIMIT} và conNua = true; danh sách chỉ đếm (không có items)`, async () => {
    const w = await setup();
    const total = AFFECTED_PREVIEW_LIMIT + 5;
    for (let i = 0; i < total; i += 1) await w.book('DaXacNhan', i);
    const id = await w.leave('ChoDuyet');

    const detail = await get(
      `/admin/leave-requests/${id}`,
      w.systemToken,
    ).expect(200);
    expect(detail.body.lichHenBiAnhHuong).toMatchObject({
      tong: total,
      conNua: true,
    });
    expect(detail.body.lichHenBiAnhHuong.items).toHaveLength(
      AFFECTED_PREVIEW_LIMIT,
    );

    const list = await get('/admin/leave-requests', w.systemToken).expect(200);
    expect(list.body.items[0].soLichHenBiAnhHuong).toBe(total);
    expect(list.body.items[0]).not.toHaveProperty('lichHenBiAnhHuong');
  });

  it('chỉ lấy lịch sau now: lịch đã qua giờ trong khoảng nghỉ không tính (cùng cận với bước huỷ của Duyệt)', async () => {
    const w = await setup();
    const past = await w.book('DaXacNhan', 0);
    await w.book('DaXacNhan', 1);
    await db.query(`UPDATE lich_hen SET thoi_gian = ? WHERE lich_hen_id = ?`, [
      `${day(-1)} 08:00:00`,
      past.lichHenId,
    ]);
    const id = await w.leave('ChoDuyet');
    const res = await get(`/admin/leave-requests/${id}`, w.systemToken).expect(
      200,
    );
    expect(res.body.lichHenBiAnhHuong.tong).toBe(1);
  });

  it('CG-14 số "bị ảnh hưởng" ở chi tiết đúng bằng số lịch Duyệt huỷ thật; sau Duyệt, chi tiết và danh sách báo 0', async () => {
    const w = await setup();
    for (let i = 0; i < 4; i += 1) await w.book('DaXacNhan', i);
    await w.book('ChoThanhToan', 4);
    await w.book('DaTiepDon', 5); // giữ nguyên
    const id = await w.leave('ChoDuyet');
    const before = await get(
      `/admin/leave-requests/${id}`,
      w.systemToken,
    ).expect(200);
    expect(before.body.lichHenBiAnhHuong.tong).toBe(5);

    const approved = await request(app.getHttpServer())
      .post(`/admin/leave-requests/${id}/approve`)
      .auth(w.systemToken, { type: 'bearer' })
      .expect(200);
    expect(approved.body.huyLichHen.daHuy).toBe(
      before.body.lichHenBiAnhHuong.tong,
    );

    const after = await get(
      `/admin/leave-requests/${id}`,
      w.systemToken,
    ).expect(200);
    expect(after.body.lichHenBiAnhHuong).toMatchObject({
      tong: 0,
      items: [],
      conNua: false,
    });
    const list = await get('/admin/leave-requests', w.systemToken).expect(200);
    expect(list.body.items[0].soLichHenBiAnhHuong).toBe(0);
  });

  it('theo ca: yêu cầu CaChieu chỉ đếm lịch ca chiều', async () => {
    const w = await setup();
    await w.book('DaXacNhan', 0); // ca sáng day(5)
    await w.book('DaXacNhan', 8); // ca chiều day(5): ô đầu tiên của ca chiều
    const id = await fx.doctor.leaveRequest({
      bacSiId: w.doctorId,
      batDau: day(5),
      hinhThuc: 'TheoCa',
      ca: 'CaChieu',
    });
    const res = await get(`/admin/leave-requests/${id}`, w.systemToken).expect(
      200,
    );
    expect(res.body.lichHenBiAnhHuong.tong).toBe(1);
  });

  it('Admin Chi nhánh khác vẫn 404 cùng thân (không hỏi booking trước khi kiểm phạm vi)', async () => {
    const w = await setup();
    const id = await w.leave('ChoDuyet');
    const other = await fx.admin.branch();
    const otherAdmin = await fx.admin.admin(other);
    const token = await tokenOf(otherAdmin.account.taiKhoanId);
    expectErrorResponse(
      await get(`/admin/leave-requests/${id}`, token),
      404,
      'KHONG_TIM_THAY',
    );
  });
});
