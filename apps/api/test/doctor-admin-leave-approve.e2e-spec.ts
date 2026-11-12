import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { nowVN, todayVN } from '../src/common/time/time.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { APPOINTMENT_CANCELLATION_PORT } from '../src/doctor/leave-approval/appointment-cancellation.port.js';
import { DoctorFixtures } from '../src/doctor/testing/doctor-fixtures.js';
import {
  formatCalendarDate,
  parseCalendarDate,
} from '../src/scheduling/calendar-date.js';

// Doctor B15 — POST /admin/leave-requests/:id/approve qua HTTP thật + MySQL thật: hình dạng 200 và no-store (PD-06), vai trò (401/403), phạm vi chi nhánh (404 cùng thân),
// PD-05/DH-08 (409 YEU_CAU_DA_XU_LY), PD-09 (409 YEU_CAU_NGHI_DA_QUA_HAN). Huỷ lịch hẹn với booking thật: src/doctor/leave-approval/admin-leave-approve.service.int-spec.ts.
// Kiểm thêm: AppModule tiêm đúng BẢN THẬT của cổng (không Noop, Q26).
describe('B15 — Quản trị viên duyệt yêu cầu nghỉ phép', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: DoctorFixtures;
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
    fx = new DoctorFixtures(db);
    sessions = app.get(SessionService);
  });
  beforeEach(async () => {
    await resetTables(db);
  });
  afterAll(async () => app?.close());

  const tokenOf = async (accountId: string) =>
    (await sessions.create(accountId)).accessToken;
  const approve = (id: string, token: string) =>
    request(app.getHttpServer())
      .post(`/admin/leave-requests/${id}/approve`)
      .auth(token, { type: 'bearer' })
      .send();
  const status = async (id: string) =>
    (
      await db.query(
        `SELECT trang_thai AS s FROM yeu_cau_nghi_phep WHERE yeu_cau_nghi_phep_id = ?`,
        [id],
      )
    )[0].s as string;

  async function setup() {
    const world = await fx.world();
    const branchB = await fx.admin.branch();
    const branchAdminB = await fx.admin.admin(branchB);
    const doctorId = world.doctor.account.taiKhoanId;
    return {
      ...world,
      doctorId,
      pending: (ngay = day(5)) =>
        fx.leaveRequest({ bacSiId: doctorId, batDau: ngay }),
      systemToken: await tokenOf(world.systemAdmin.account.taiKhoanId),
      branchToken: await tokenOf(world.branchAdmin.account.taiKhoanId),
      branchBToken: await tokenOf(branchAdminB.account.taiKhoanId),
    };
  }

  it('cổng huỷ lịch trong AppModule là bản thật nối booking (không Noop, Q26)', () => {
    expect(app.get(APPOINTMENT_CANCELLATION_PORT).constructor.name).toBe(
      'BookingCancellationAdapter',
    );
  });

  it('PD-06 Admin Toàn hệ thống và Admin đúng chi nhánh duyệt được: 200, no-store, đủ hình dạng kết quả', async () => {
    const w = await setup();
    const id = await w.pending();
    const res = await approve(id, w.systemToken).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      yeuCauNghiPhepId: id,
      trangThai: 'DaDuyet',
      thoiDiemXuLy: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
      huyLichHen: {
        hoanTat: true,
        daHuy: 0,
        daHuyTruocDo: 0,
        khongHuyDuoc: [],
      },
    });
    expect(await status(id)).toBe('DaDuyet');

    const other = await w.pending(day(6));
    await approve(other, w.branchToken).expect(200);
  });

  it('PD-05 duyệt lại yêu cầu đã duyệt hay đã từ chối ⇒ 409 YEU_CAU_DA_XU_LY', async () => {
    const w = await setup();
    const id = await w.pending();
    await approve(id, w.systemToken).expect(200);
    expectErrorResponse(
      await approve(id, w.systemToken),
      409,
      'YEU_CAU_DA_XU_LY',
    );
    const rejected = await fx.leaveRequest({
      bacSiId: w.doctorId,
      batDau: day(7),
      trangThai: 'TuChoi',
      nguoiXuLyId: w.systemAdmin.account.taiKhoanId,
      thoiDiemXuLy: '2026-11-05 09:00:00',
    });
    expectErrorResponse(
      await approve(rejected, w.systemToken),
      409,
      'YEU_CAU_DA_XU_LY',
    );
    expect(await status(rejected)).toBe('TuChoi');
  });

  it('PD-09 ngày kết thúc đã qua ⇒ 409 YEU_CAU_NGHI_DA_QUA_HAN, yêu cầu vẫn ChoDuyet', async () => {
    const w = await setup();
    const id = await w.pending(day(-1));
    const body = expectErrorResponse(
      await approve(id, w.systemToken),
      409,
      'YEU_CAU_NGHI_DA_QUA_HAN',
    );
    expect(body.thongBao).toBe('Yêu cầu đã quá hạn, chỉ có thể từ chối.');
    expect(await status(id)).toBe('ChoDuyet');
  });

  it('Admin Chi nhánh khác: 404 cùng thân với id không có và id sai dạng; không đổi gì', async () => {
    const w = await setup();
    const id = await w.pending();
    const bodies = [
      expectErrorResponse(
        await approve(id, w.branchBToken),
        404,
        'KHONG_TIM_THAY',
      ),
      expectErrorResponse(
        await approve('999999', w.branchBToken),
        404,
        'KHONG_TIM_THAY',
      ),
      expectErrorResponse(
        await approve('abc', w.branchBToken),
        404,
        'KHONG_TIM_THAY',
      ),
    ];
    for (const body of bodies) expect(body).toEqual(bodies[0]);
    expect(await status(id)).toBe('ChoDuyet');
    expect(
      Number(
        (await db.query(`SELECT COUNT(*) AS so FROM nhat_ky_hanh_dong`))[0].so,
      ),
    ).toBe(0);
  });

  it('Bác sĩ, Lễ tân, Bệnh nhân ⇒ 403 KHONG_DU_QUYEN; chưa đăng nhập ⇒ 401; không đổi gì', async () => {
    const w = await setup();
    const id = await w.pending();
    const patient = await fx.admin.patient();
    for (const accountId of [
      w.doctorId,
      w.receptionist.account.taiKhoanId,
      patient.account.taiKhoanId,
    ])
      expectErrorResponse(
        await approve(id, await tokenOf(accountId)),
        403,
        'KHONG_DU_QUYEN',
      );
    expectErrorResponse(
      await request(app.getHttpServer())
        .post(`/admin/leave-requests/${id}/approve`)
        .send(),
      401,
      'CHUA_DANG_NHAP',
    );
    expect(await status(id)).toBe('ChoDuyet');
  });
});
