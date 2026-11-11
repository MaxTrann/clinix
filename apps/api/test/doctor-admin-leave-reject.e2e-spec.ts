import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AuditService } from '../src/audit/audit.service.js';
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

// Doctor B14 — POST /admin/leave-requests/:id/reject qua HTTP thật + MySQL thật:
// PD-03, PD-04, PD-05, PD-14, PD-15 (từ chối), PD-18, DH-08 (hai Admin cùng từ chối), TD-05 (nhật ký), YN-17 (khung giờ trở lại).
describe('B14 — Quản trị viên từ chối yêu cầu nghỉ phép', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: DoctorFixtures;
  let sessions: SessionService;

  const TODAY = todayVN(nowVN());
  const day = (offset: number) =>
    formatCalendarDate((parseCalendarDate(TODAY) as number) + offset);
  const REASON = 'Trùng lịch phẫu thuật đã xếp trước đó';
  const DOCTOR_REASON = 'Lý do riêng tư của bác sĩ không được lộ';

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
    vi.restoreAllMocks();
  });
  afterAll(async () => app?.close());

  const tokenOf = async (accountId: string) =>
    (await sessions.create(accountId)).accessToken;
  const reject = (id: string, body: unknown, token: string) =>
    request(app.getHttpServer())
      .post(`/admin/leave-requests/${id}/reject`)
      .auth(token, { type: 'bearer' })
      .send(body as object);
  const row = async (id: string) =>
    (
      await db.query(
        `SELECT trang_thai, CAST(nguoi_xu_ly_id AS CHAR) AS nguoi, thoi_diem_xu_ly FROM yeu_cau_nghi_phep WHERE yeu_cau_nghi_phep_id = ?`,
        [id],
      )
    )[0];
  const count = async (table: string) =>
    Number((await db.query(`SELECT COUNT(*) AS so FROM ${table}`))[0].so);

  /** Chi nhánh A (bác sĩ A, hai Admin Toàn hệ thống, Admin Chi nhánh A) và chi nhánh B (bác sĩ B, Admin Chi nhánh B). */
  async function setup() {
    const world = await fx.world();
    const secondAdmin = await fx.admin.admin();
    const branchB = await fx.admin.branch();
    await fx.admin.weeklySchedule(branchB.chiNhanhId);
    const doctorB = await fx.admin.doctor(branchB);
    const branchAdminB = await fx.admin.admin(branchB);
    const doctorId = world.doctor.account.taiKhoanId;
    for (const ca of ['CaSang', 'CaChieu'] as const)
      await fx.shiftWithSlots(world.doctor.profile, { ngay: day(5), ca });
    return {
      ...world,
      doctorId,
      doctorBId: doctorB.account.taiKhoanId,
      systemAdminId: world.systemAdmin.account.taiKhoanId,
      secondAdminId: secondAdmin.account.taiKhoanId,
      systemToken: await tokenOf(world.systemAdmin.account.taiKhoanId),
      secondToken: await tokenOf(secondAdmin.account.taiKhoanId),
      branchToken: await tokenOf(world.branchAdmin.account.taiKhoanId),
      branchBToken: await tokenOf(branchAdminB.account.taiKhoanId),
    };
  }
  const pending = (w: { doctorId: string }, ngay = day(5)) =>
    fx.leaveRequest({ bacSiId: w.doctorId, batDau: ngay });

  it('PD-03 từ chối: TuChoi, người và thời điểm xử lý, thông báo cho Bác sĩ kèm lý do; 200 và no-store', async () => {
    const w = await setup();
    const id = await pending(w);
    const res = await reject(
      id,
      { lyDo: `  ${REASON} ` },
      w.systemToken,
    ).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      yeuCauNghiPhepId: id,
      trangThai: 'TuChoi',
      thoiDiemXuLy: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
    });

    const saved = await row(id);
    expect(saved.trang_thai).toBe('TuChoi');
    expect(saved.nguoi).toBe(w.systemAdminId);
    expect(saved.thoi_diem_xu_ly).not.toBeNull();

    // Bác sĩ nhận đúng một thông báo `NghiPhepTuChoi` kèm lý do của Admin (đã cắt khoảng trắng), KHÔNG kèm lý do xin nghỉ.
    const notes: { who: string; type: string; body: string }[] = await db.query(
      `SELECT CAST(tai_khoan_id AS CHAR) AS who, loai_su_kien AS type, noi_dung AS body FROM thong_bao`,
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ who: w.doctorId, type: 'NghiPhepTuChoi' });
    expect(notes[0]?.body).toContain(`Lý do: ${REASON}`);
    expect(notes[0]?.body).not.toContain(DOCTOR_REASON);
  });

  it('TD-05 nhật ký TuChoiNghiPhep: danh sách trắng, người thực hiện từ phiên, chi nhánh bác sĩ, không lý do của Bác sĩ', async () => {
    const w = await setup();
    const id = await fx.leaveRequest({
      bacSiId: w.doctorId,
      hinhThuc: 'TheoCa',
      batDau: day(5),
      ca: 'CaSang',
    });
    await db.query(
      `UPDATE yeu_cau_nghi_phep SET ly_do = ? WHERE yeu_cau_nghi_phep_id = ?`,
      [DOCTOR_REASON, id],
    );
    await reject(id, { lyDo: REASON }, w.branchToken).expect(200);

    const logs: {
      actor: string;
      branch: string;
      action: string;
      type: string;
      target: string;
      result: string;
      changes: Record<string, unknown>;
    }[] = await db.query(
      `SELECT CAST(tai_khoan_id AS CHAR) AS actor, CAST(chi_nhanh_id AS CHAR) AS branch, hanh_dong AS action,
              loai_doi_tuong AS type, CAST(ma_doi_tuong AS CHAR) AS target, ket_qua AS result, chi_tiet_thay_doi AS changes
         FROM nhat_ky_hanh_dong`,
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actor: w.branchAdmin.account.taiKhoanId,
      branch: w.branch.chiNhanhId,
      action: 'TuChoiNghiPhep',
      type: 'yeu_cau_nghi_phep',
      target: id,
      result: 'ThanhCong',
    });
    const changes =
      typeof logs[0]?.changes === 'string'
        ? JSON.parse(logs[0].changes)
        : logs[0]?.changes;
    expect(changes).toEqual({
      bac_si_id: w.doctorId,
      ngay_bat_dau: day(5),
      ngay_ket_thuc: day(5),
      ca: 'CaSang',
      ly_do_tu_choi: REASON,
    });
    expect(JSON.stringify(logs[0])).not.toContain(DOCTOR_REASON);
  });

  it('PD-04 lý do thiếu / rỗng / quá 255 / sai kiểu / ký tự điều khiển ⇒ 400 LY_DO_TU_CHOI_KHONG_HOP_LE và không đổi gì', async () => {
    const w = await setup();
    const id = await pending(w);
    for (const body of [
      {},
      { lyDo: '' },
      { lyDo: '   ' },
      { lyDo: 'a'.repeat(256) },
      { lyDo: 123 },
      { lyDo: null },
      { lyDo: ['x'] },
      { lyDo: 'dòng 1\ndòng 2' },
    ])
      expectErrorResponse(
        await reject(id, body, w.systemToken),
        400,
        'LY_DO_TU_CHOI_KHONG_HOP_LE',
      );
    expect((await row(id)).trang_thai).toBe('ChoDuyet');
    expect(await count('thong_bao')).toBe(0);
    expect(await count('nhat_ky_hanh_dong')).toBe(0);
    // Biên: đúng 1 và đúng 255 ký tự thì nhận.
    await reject(id, { lyDo: 'a'.repeat(255) }, w.systemToken).expect(200);
    const other = await pending(w, day(6));
    await reject(other, { lyDo: 'a' }, w.systemToken).expect(200);
  });

  it('khoá lạ trong thân (trangThai, nguoiXuLyId) ⇒ 400 TRUONG_KHONG_DUOC_PHEP và không đổi gì', async () => {
    const w = await setup();
    const id = await pending(w);
    const res = await reject(
      id,
      { lyDo: REASON, trangThai: 'DaDuyet', nguoiXuLyId: w.secondAdminId },
      w.systemToken,
    );
    const body = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
    expect(body.loi).toContainEqual({
      truong: 'trangThai',
      ma: 'TRUONG_KHONG_DUOC_PHEP',
    });
    expect((await row(id)).trang_thai).toBe('ChoDuyet');
  });

  it('PD-05 từ chối yêu cầu đã xử lý (TuChoi, DaDuyet), bấm lại lần hai ⇒ 409 YEU_CAU_DA_XU_LY và không ghi thêm', async () => {
    const w = await setup();
    const id = await pending(w);
    await reject(id, { lyDo: REASON }, w.systemToken).expect(200);
    const again = await reject(id, { lyDo: REASON }, w.secondToken);
    expectErrorResponse(again, 409, 'YEU_CAU_DA_XU_LY');
    const approved = await fx.leaveRequest({
      bacSiId: w.doctorId,
      batDau: day(6),
      trangThai: 'DaDuyet',
      nguoiXuLyId: w.systemAdminId,
      thoiDiemXuLy: '2026-11-05 09:00:00',
    });
    expectErrorResponse(
      await reject(approved, { lyDo: REASON }, w.systemToken),
      409,
      'YEU_CAU_DA_XU_LY',
    );
    // Người xử lý đầu tiên vẫn là người ghi nhận; chỉ có 1 thông báo và 1 dòng nhật ký.
    expect((await row(id)).nguoi).toBe(w.systemAdminId);
    expect((await row(approved)).trang_thai).toBe('DaDuyet');
    expect(await count('thong_bao')).toBe(1);
    expect(await count('nhat_ky_hanh_dong')).toBe(1);
  });

  it('PD-15 Admin Chi nhánh khác: 404 cùng thân với "không có" và không đổi gì; Toàn hệ thống và đúng chi nhánh thì thành công', async () => {
    const w = await setup();
    const id = await pending(w);
    const bodies = [
      expectErrorResponse(
        await reject(id, { lyDo: REASON }, w.branchBToken),
        404,
        'KHONG_TIM_THAY',
      ),
      expectErrorResponse(
        await reject('999999', { lyDo: REASON }, w.branchBToken),
        404,
        'KHONG_TIM_THAY',
      ),
      expectErrorResponse(
        await reject('abc', { lyDo: REASON }, w.branchBToken),
        404,
        'KHONG_TIM_THAY',
      ),
    ];
    for (const body of bodies) expect(body).toEqual(bodies[0]);
    expect((await row(id)).trang_thai).toBe('ChoDuyet');
    expect(await count('nhat_ky_hanh_dong')).toBe(0);

    // Chi nhánh B không biết yêu cầu A đã xử lý hay chưa: đã từ chối rồi vẫn 404, không phải 409.
    await reject(id, { lyDo: REASON }, w.branchToken).expect(200);
    expectErrorResponse(
      await reject(id, { lyDo: REASON }, w.branchBToken),
      404,
      'KHONG_TIM_THAY',
    );

    const other = await pending(w, day(6));
    await reject(other, { lyDo: REASON }, w.systemToken).expect(200);
  });

  it('PD-16 bác sĩ đã đổi chi nhánh: quyền theo chi nhánh HIỆN TẠI', async () => {
    const w = await setup();
    const id = await pending(w);
    const [{ chi_nhanh_id }] = await db.query(
      `SELECT chi_nhanh_id FROM bac_si WHERE tai_khoan_id = ?`,
      [w.doctorBId],
    );
    await db.query(
      `UPDATE bac_si SET chi_nhanh_id = ? WHERE tai_khoan_id = ?`,
      [chi_nhanh_id, w.doctorId],
    );
    expectErrorResponse(
      await reject(id, { lyDo: REASON }, w.branchToken),
      404,
      'KHONG_TIM_THAY',
    );
    await reject(id, { lyDo: REASON }, w.branchBToken).expect(200);
    const [log] = await db.query(
      `SELECT CAST(chi_nhanh_id AS CHAR) AS branch FROM nhat_ky_hanh_dong`,
    );
    expect(log.branch).toBe(String(chi_nhanh_id));
  });

  it('PD-14 Bác sĩ, Lễ tân, Bệnh nhân ⇒ 403; chưa đăng nhập ⇒ 401; không đổi gì', async () => {
    const w = await setup();
    const id = await pending(w);
    const patient = await fx.admin.patient();
    for (const accountId of [
      w.doctorId,
      w.receptionist.account.taiKhoanId,
      patient.account.taiKhoanId,
    ])
      expectErrorResponse(
        await reject(id, { lyDo: REASON }, await tokenOf(accountId)),
        403,
        'KHONG_DU_QUYEN',
      );
    expectErrorResponse(
      await request(app.getHttpServer())
        .post(`/admin/leave-requests/${id}/reject`)
        .send({ lyDo: REASON }),
      401,
      'CHUA_DANG_NHAP',
    );
    expect((await row(id)).trang_thai).toBe('ChoDuyet');
  });

  it('PD-18 lỗi ghi nhật ký ⇒ hoàn tác cả việc từ chối (yêu cầu vẫn ChoDuyet, không thông báo)', async () => {
    const w = await setup();
    const id = await pending(w);
    vi.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(
      new Error('nhat_ky hỏng'),
    );
    expectErrorResponse(
      await reject(id, { lyDo: REASON }, w.systemToken),
      500,
      'LOI_HE_THONG',
    );
    expect((await row(id)).trang_thai).toBe('ChoDuyet');
    expect((await row(id)).nguoi).toBeNull();
    expect(await count('thong_bao')).toBe(0);
    expect(await count('nhat_ky_hanh_dong')).toBe(0);
    // Lỗi tạm thời: bấm lại thành công.
    await reject(id, { lyDo: REASON }, w.systemToken).expect(200);
  });

  it('lỗi ghi thông báo ⇒ cũng hoàn tác cả việc từ chối và dòng nhật ký (H12)', async () => {
    const w = await setup();
    const id = await pending(w);
    vi.spyOn(app.get(LeaveNotifier), 'notify').mockRejectedValueOnce(
      new Error('thong_bao hỏng'),
    );
    expectErrorResponse(
      await reject(id, { lyDo: REASON }, w.systemToken),
      500,
      'LOI_HE_THONG',
    );
    expect((await row(id)).trang_thai).toBe('ChoDuyet');
    expect(await count('nhat_ky_hanh_dong')).toBe(0);
  });

  it('DH-08 hai Admin cùng từ chối một yêu cầu: đúng một 200, một 409 YEU_CAU_DA_XU_LY; chỉ một thông báo và một dòng nhật ký', async () => {
    const w = await setup();
    for (let round = 0; round < 5; round += 1) {
      const id = await pending(w, day(6 + round));
      const [a, b] = await Promise.all([
        reject(id, { lyDo: 'Lý do của Admin thứ nhất' }, w.systemToken),
        reject(id, { lyDo: 'Lý do của Admin thứ hai' }, w.secondToken),
      ]);
      const statuses = [a.status, b.status].sort((x, y) => x - y);
      expect(statuses).toEqual([200, 409]);
      const loser = a.status === 409 ? a : b;
      expectErrorResponse(loser, 409, 'YEU_CAU_DA_XU_LY');
      const winnerId = a.status === 200 ? w.systemAdminId : w.secondAdminId;
      expect((await row(id)).nguoi).toBe(winnerId);
    }
    expect(await count('thong_bao')).toBe(5);
    expect(await count('nhat_ky_hanh_dong')).toBe(5);
  });

  it('YN-17 sau khi từ chối, ô khung giờ của ngày trở lại danh sách còn trống (nghỉ ChoDuyet từng loại bỏ chúng)', async () => {
    const w = await setup();
    const reader = app.get(AvailableSlotsReader);
    const id = await pending(w);
    const blocked = await reader.list({ bacSiId: w.doctorId, ngay: day(5) });
    expect(blocked.trangThaiNgay).toBe('NghiPhep');
    expect(blocked.khungGio).toEqual([]);

    await reject(id, { lyDo: REASON }, w.systemToken).expect(200);
    const after = await reader.list({ bacSiId: w.doctorId, ngay: day(5) });
    expect(after.trangThaiNgay).toBe('CoLich');
    expect(after.khungGio.length).toBeGreaterThan(0);
    // Khung giờ không bao giờ bị đổi trạng thái bởi từ chối.
    const [{ so }] = await db.query(
      `SELECT COUNT(*) AS so FROM khung_gio WHERE trang_thai <> 'ConTrong'`,
    );
    expect(Number(so)).toBe(0);
  });
});
