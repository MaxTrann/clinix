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
import {
  formatCalendarDate,
  parseCalendarDate,
} from '../src/scheduling/calendar-date.js';

// Doctor B16 — POST /admin/leave-requests/:id/retry-cancellations ("Xử lý lại") qua HTTP thật + MySQL thật + booking thật:
// PD-11 (chỉ DaDuyet; chạy hai lần thì lần hai daHuy = 0), vai trò 401/403, phạm vi chi nhánh (404 cùng thân), no-store. Phần dịch vụ và sweeper: src/doctor/leave-approval/*.int-spec.ts.
describe('B16 — Quản trị viên "Xử lý lại" huỷ lịch hẹn sau khi duyệt', () => {
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
  const retry = (id: string, token: string) =>
    request(app.getHttpServer())
      .post(`/admin/leave-requests/${id}/retry-cancellations`)
      .auth(token, { type: 'bearer' })
      .send();
  const stateOf = async (lichHenId: string) =>
    (
      await db.query(
        `SELECT trang_thai AS s FROM lich_hen WHERE lich_hen_id = ?`,
        [lichHenId],
      )
    )[0].s as string;

  /** Thế giới đặt được ở `day(5)` (đồng hồ thật) cộng Admin Chi nhánh khác; hai lịch `DaXacNhan` ở hai khung giờ đầu. */
  async function setup() {
    const world = await fx.world({ ngay: day(5) });
    const doctorId = world.doctor.account.taiKhoanId;
    const patientId = world.patient.account.taiKhoanId;
    const book = (slot: number) =>
      fx.appointmentIn('DaXacNhan', {
        doctor: world.doctor.profile,
        khungGioId: world.slotIds[slot] as string,
        patientId,
      });
    const branchB = await fx.admin.branch();
    const branchAdminB = await fx.admin.admin(branchB);
    return {
      ...world,
      doctorId,
      book,
      leave: (trangThai: 'ChoDuyet' | 'DaDuyet' | 'TuChoi', batDau = day(5)) =>
        fx.doctor.leaveRequest({
          bacSiId: doctorId,
          batDau,
          trangThai,
          ...(trangThai === 'ChoDuyet'
            ? {}
            : {
                nguoiXuLyId: world.systemAdmin.account.taiKhoanId,
                thoiDiemXuLy: '2026-11-05 09:00:00',
              }),
        }),
      systemToken: await tokenOf(world.systemAdmin.account.taiKhoanId),
      branchToken: await tokenOf(world.branchAdmin.account.taiKhoanId),
      branchBToken: await tokenOf(branchAdminB.account.taiKhoanId),
    };
  }

  it('PD-11 DaDuyet: 200, no-store, huỷ các lịch còn lại; chạy lần hai thì daHuy = 0', async () => {
    const w = await setup();
    const first = await w.book(0);
    const second = await w.book(1);
    const id = await w.leave('DaDuyet');

    const res = await retry(id, w.systemToken).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      yeuCauNghiPhepId: id,
      trangThai: 'DaDuyet',
      huyLichHen: {
        hoanTat: true,
        daHuy: 2,
        daHuyTruocDo: 0,
        khongHuyDuoc: [],
      },
    });
    expect(await stateOf(first.lichHenId)).toBe('DaHuy');
    expect(await stateOf(second.lichHenId)).toBe('DaHuy');

    const again = await retry(id, w.branchToken).expect(200);
    expect(again.body.huyLichHen).toEqual({
      hoanTat: true,
      daHuy: 0,
      daHuyTruocDo: 0,
      khongHuyDuoc: [],
    });
  });

  it('PD-11 ChoDuyet và TuChoi ⇒ 409 YEU_CAU_DA_XU_LY và không huỷ gì', async () => {
    const w = await setup();
    const lich = await w.book(0);
    for (const status of ['ChoDuyet', 'TuChoi'] as const) {
      const id = await w.leave(status, status === 'TuChoi' ? day(6) : day(5));
      const body = expectErrorResponse(
        await retry(id, w.systemToken),
        409,
        'YEU_CAU_DA_XU_LY',
      );
      expect(body.thongBao).toBe('Chỉ xử lý lại được yêu cầu đã duyệt.');
    }
    expect(await stateOf(lich.lichHenId)).toBe('DaXacNhan');
  });

  it('Admin Chi nhánh khác: 404 cùng thân với id không có và id sai dạng, kể cả với yêu cầu ChoDuyet; không huỷ gì', async () => {
    const w = await setup();
    const lich = await w.book(0);
    const approved = await w.leave('DaDuyet');
    const pending = await w.leave('ChoDuyet', day(6));
    const bodies = [
      expectErrorResponse(
        await retry(approved, w.branchBToken),
        404,
        'KHONG_TIM_THAY',
      ),
      expectErrorResponse(
        await retry(pending, w.branchBToken),
        404,
        'KHONG_TIM_THAY',
      ),
      expectErrorResponse(
        await retry('999999', w.branchBToken),
        404,
        'KHONG_TIM_THAY',
      ),
      expectErrorResponse(
        await retry('abc', w.branchBToken),
        404,
        'KHONG_TIM_THAY',
      ),
    ];
    for (const body of bodies) expect(body).toEqual(bodies[0]);
    expect(await stateOf(lich.lichHenId)).toBe('DaXacNhan');
    // Admin đúng chi nhánh thì được
    await retry(approved, w.branchToken).expect(200);
  });

  it('Bác sĩ, Lễ tân, Bệnh nhân ⇒ 403 KHONG_DU_QUYEN; chưa đăng nhập ⇒ 401; không huỷ gì', async () => {
    const w = await setup();
    const lich = await w.book(0);
    const id = await w.leave('DaDuyet');
    for (const accountId of [
      w.doctorId,
      w.receptionist.account.taiKhoanId,
      w.patient.account.taiKhoanId,
    ])
      expectErrorResponse(
        await retry(id, await tokenOf(accountId)),
        403,
        'KHONG_DU_QUYEN',
      );
    expectErrorResponse(
      await request(app.getHttpServer())
        .post(`/admin/leave-requests/${id}/retry-cancellations`)
        .send(),
      401,
      'CHUA_DANG_NHAP',
    );
    expect(await stateOf(lich.lichHenId)).toBe('DaXacNhan');
  });
});
