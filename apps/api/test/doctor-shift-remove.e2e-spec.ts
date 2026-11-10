import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AuditError } from '../src/audit/audit-error.js';
import { AuditService } from '../src/audit/audit.service.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { nowVN, todayVN } from '../src/common/time/time.js';
import { resetTables } from '../src/database/testing/test-database.js';
import type { KhungGio } from '../src/admin/entities/khung-gio.entity.js';
import { createGate } from '../src/doctor/testing/concurrency-harness.js';
import { DoctorFixtures } from '../src/doctor/testing/doctor-fixtures.js';
import { assertInvariants } from '../src/doctor/testing/invariants.js';
import {
  formatCalendarDate,
  parseCalendarDate,
} from '../src/scheduling/calendar-date.js';

// Doctor B4 — DELETE /admin/doctor-shifts/:id qua HTTP thật + MySQL thật: PC-19, PC-22, PC-23, DH-05 (+ phạm vi, quyền, nhật ký).
describe('B4 — gỡ ca', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: DoctorFixtures;
  let sessions: SessionService;

  // Ngày tương lai so với đồng hồ thật, để ca luôn "chưa qua".
  const TODAY = todayVN(nowVN());
  const dayFromToday = (offset: number) =>
    formatCalendarDate((parseCalendarDate(TODAY) as number) + offset);
  const FUTURE = dayFromToday(5);

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
  const remove = (id: string, token: string) =>
    request(app.getHttpServer())
      .delete(`/admin/doctor-shifts/${id}`)
      .auth(token, { type: 'bearer' });
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
  /** Ca kèm khung giờ; `slots[0]` là ô đầu để từng test đổi trạng thái. */
  async function shiftOf(
    w: Awaited<ReturnType<typeof setup>>,
    ngay = FUTURE,
    ca: 'CaSang' | 'CaChieu' = 'CaSang',
  ) {
    return fx.shiftWithSlots(w.doctor.profile, { ngay, ca });
  }
  /** Gắn một lịch hẹn vào ô (đúng như booking: ô sang DaDat, lịch trỏ vào ô). */
  async function bookSlot(
    w: Awaited<ReturnType<typeof setup>>,
    slotId: string,
    status: 'DaXacNhan' | 'DaHuy',
  ) {
    const patient = await fx.admin.patient();
    const slot = { khungGioId: slotId, ngayGio: new Date() } as KhungGio;
    const appointment = await fx.admin.appointment(
      w.doctor.profile,
      slot,
      patient.account.taiKhoanId,
      { trangThai: status },
    );
    if (status === 'DaXacNhan')
      await db.query(
        "UPDATE khung_gio SET trang_thai = 'DaDat' WHERE khung_gio_id = ?",
        [slotId],
      );
    return appointment;
  }

  it('PC-19 gỡ ca chưa có lịch hẹn: 204, ca và MỌI khung giờ bị xoá, đúng ca đó thôi', async () => {
    const w = await setup();
    const target = await shiftOf(w, FUTURE, 'CaSang');
    const keep = await shiftOf(w, FUTURE, 'CaChieu');
    await remove(target.shift.lichLamViecId, w.systemToken)
      .expect(204)
      .expect((res) => expect(res.body).toEqual({}));
    expect(await count('lich_lam_viec')).toBe(1);
    expect(await count('khung_gio')).toBe(keep.slotIds.length);
    const left = await db.query(
      'SELECT CAST(lich_lam_viec_id AS CHAR) AS id FROM lich_lam_viec',
    );
    expect(left).toEqual([{ id: keep.shift.lichLamViecId }]);
    await assertInvariants(db, TODAY);
  });

  it('PC-19 ca HÔM NAY vẫn gỡ được khi mọi ô còn trống (ca hôm nay tính là còn, quy tắc 13)', async () => {
    const w = await setup();
    const { shift } = await shiftOf(w, TODAY);
    await remove(shift.lichLamViecId, w.systemToken).expect(204);
    expect(await count('lich_lam_viec')).toBe(0);
  });

  it('PC-19 nhật ký GoLichLamViec: đúng người thực hiện, chi nhánh hiện tại của bác sĩ, nội dung danh sách trắng', async () => {
    const w = await setup();
    const { shift, slotIds } = await shiftOf(w);
    await remove(shift.lichLamViecId, w.systemToken).expect(204);
    const logs: Record<string, string>[] = await db.query(
      `SELECT CAST(tai_khoan_id AS CHAR) AS actor, CAST(chi_nhanh_id AS CHAR) AS branch, hanh_dong AS action,
              loai_doi_tuong AS type, CAST(ma_doi_tuong AS CHAR) AS target, ket_qua AS result, chi_tiet_thay_doi AS changes
         FROM nhat_ky_hanh_dong`,
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actor: w.systemAdmin.account.taiKhoanId,
      branch: w.branch.chiNhanhId,
      action: 'GoLichLamViec',
      type: 'lich_lam_viec',
      target: shift.lichLamViecId,
      result: 'ThanhCong',
    });
    const changes =
      typeof logs[0]?.changes === 'string'
        ? JSON.parse(logs[0].changes)
        : logs[0]?.changes;
    expect(changes).toEqual({
      bac_si_id: w.doctorId,
      ngay: FUTURE,
      ca: 'CaSang',
      so_khung_gio: slotIds.length,
    });
  });

  it('PC-24 nhật ký lỗi ⇒ hoàn tác: ca và khung giờ còn nguyên', async () => {
    const w = await setup();
    const { shift, slotIds } = await shiftOf(w);
    vi.spyOn(app.get(AuditService), 'record').mockRejectedValue(
      new AuditError('AUDIT_WRITE_FAILED'),
    );
    expect((await remove(shift.lichLamViecId, w.systemToken)).status).toBe(500);
    expect(await count('lich_lam_viec')).toBe(1);
    expect(await count('khung_gio')).toBe(slotIds.length);
  });

  it('PC-22 ô DaDat có lịch hẹn ⇒ 409 CA_DANG_CO_LICH_HEN kèm mã lịch hẹn; không xoá gì', async () => {
    const w = await setup();
    const { shift, slotIds } = await shiftOf(w);
    const appointment = await bookSlot(w, slotIds[2] as string, 'DaXacNhan');
    const body = expectErrorResponse(
      await remove(shift.lichLamViecId, w.systemToken),
      409,
      'CA_DANG_CO_LICH_HEN',
    );
    expect(body.chiTiet).toEqual({ maLichHen: [appointment.maLichHen] });
    expect(await count('lich_lam_viec')).toBe(1);
    expect(await count('khung_gio')).toBe(slotIds.length);
    expect(await count('nhat_ky_hanh_dong')).toBe(0);
  });

  it('PC-22 ô DangGiuCho dù đã HẾT HẠN chưa quét vẫn chặn (D7); chưa có lịch hẹn nên maLichHen rỗng', async () => {
    const w = await setup();
    const { shift, slotIds } = await shiftOf(w);
    await db.query(
      "UPDATE khung_gio SET trang_thai = 'DangGiuCho', giu_cho_den = '2020-01-01 00:00:00' WHERE khung_gio_id = ?",
      [slotIds[0]],
    );
    const body = expectErrorResponse(
      await remove(shift.lichLamViecId, w.systemToken),
      409,
      'CA_DANG_CO_LICH_HEN',
    );
    expect(body.chiTiet).toEqual({ maLichHen: [] });
    expect(await count('khung_gio')).toBe(slotIds.length);
  });

  it('PC-22 ô đã về ConTrong nhưng TỪNG có lịch hẹn (đã huỷ) ⇒ vẫn 409 (khoá ngoại), không xoá gì', async () => {
    const w = await setup();
    const { shift, slotIds } = await shiftOf(w);
    const cancelled = await bookSlot(w, slotIds[1] as string, 'DaHuy');
    const body = expectErrorResponse(
      await remove(shift.lichLamViecId, w.systemToken),
      409,
      'CA_DANG_CO_LICH_HEN',
    );
    expect(body.chiTiet).toEqual({ maLichHen: [cancelled.maLichHen] });
    expect(await count('lich_lam_viec')).toBe(1);
    expect(await count('khung_gio')).toBe(slotIds.length);
  });

  it('PC-23 ca đã qua ⇒ 409 CA_DA_QUA, không xoá gì', async () => {
    const w = await setup();
    const { shift, slotIds } = await shiftOf(w, dayFromToday(-1));
    expectErrorResponse(
      await remove(shift.lichLamViecId, w.systemToken),
      409,
      'CA_DA_QUA',
    );
    expect(await count('khung_gio')).toBe(slotIds.length);
  });

  it('QH-02 Admin Chi nhánh gỡ ca trong phạm vi được; ca của chi nhánh khác ⇒ 404 cùng thân với "không có ca"', async () => {
    const w = await setup();
    const otherBranch = await fx.admin.branch();
    await fx.admin.weeklySchedule(otherBranch.chiNhanhId);
    const outsider = await fx.admin.doctor(otherBranch);
    const foreign = await fx.shiftWithSlots(outsider.profile, {
      ngay: FUTURE,
      ca: 'CaSang',
    });
    const outside = expectErrorResponse(
      await remove(foreign.shift.lichLamViecId, w.branchToken),
      404,
      'KHONG_TIM_THAY',
    );
    const missing = expectErrorResponse(
      await remove('999999999', w.branchToken),
      404,
      'KHONG_TIM_THAY',
    );
    expect(outside).toEqual(missing);
    expect(await count('lich_lam_viec')).toBe(1); // ca ngoài phạm vi còn nguyên

    const own = await shiftOf(w);
    await remove(own.shift.lichLamViecId, w.branchToken).expect(204);
    // Toàn hệ thống gỡ được ca của chi nhánh bất kỳ.
    await remove(foreign.shift.lichLamViecId, w.systemToken).expect(204);
    expect(await count('lich_lam_viec')).toBe(0);
  });

  it('id sai dạng ⇒ 404 KHONG_TIM_THAY (không 400/500); gỡ lần hai cùng ca ⇒ 404', async () => {
    const w = await setup();
    for (const id of ['abc', '0', '-1', '1.5', '9'.repeat(30)])
      expectErrorResponse(
        await remove(id, w.systemToken),
        404,
        'KHONG_TIM_THAY',
      );
    const { shift } = await shiftOf(w);
    await remove(shift.lichLamViecId, w.systemToken).expect(204);
    expectErrorResponse(
      await remove(shift.lichLamViecId, w.systemToken),
      404,
      'KHONG_TIM_THAY',
    );
  });

  it('QH-01 Lễ tân, Bác sĩ ⇒ 403; không đăng nhập ⇒ 401; ca không bị xoá', async () => {
    const w = await setup();
    const { shift } = await shiftOf(w);
    expectErrorResponse(
      await request(app.getHttpServer()).delete(
        `/admin/doctor-shifts/${shift.lichLamViecId}`,
      ),
      401,
      'CHUA_DANG_NHAP',
    );
    for (const account of [w.receptionist.account, w.doctor.account])
      expectErrorResponse(
        await remove(shift.lichLamViecId, await tokenOf(account.taiKhoanId)),
        403,
        'KHONG_DU_QUYEN',
      );
    expect(await count('lich_lam_viec')).toBe(1);
  });

  it('DH-05 gỡ ca đua với đặt lịch (giả booking: khoá bac_si S, khung_gio X, chèn lich_hen), 12 vòng: đúng một bên thắng, không mồ côi', async () => {
    const w = await setup();
    const patient = await fx.admin.patient();
    for (let round = 0; round < 12; round += 1) {
      const ngay = dayFromToday(10 + round);
      const { shift, slotIds } = await shiftOf(w, ngay);
      const target = slotIds[3] as string;
      const gate = createGate(2);

      const deleting = async () => {
        await gate.arrive();
        return remove(shift.lichLamViecId, w.systemToken);
      };
      // Giả booking đúng thứ tự khoá chung: bac_si (S) → khung_gio (X) → ghi lịch hẹn.
      const booking = async (): Promise<'DAT_DUOC' | 'KHONG_CO_KHUNG_GIO'> => {
        await gate.arrive();
        return db.transaction('READ COMMITTED', async (em) => {
          await em.query(
            'SELECT 1 FROM bac_si WHERE tai_khoan_id = ? FOR SHARE',
            [w.doctorId],
          );
          const rows: { trangThai: string }[] = await em.query(
            'SELECT trang_thai AS trangThai FROM khung_gio WHERE khung_gio_id = ? FOR UPDATE',
            [target],
          );
          if (rows.length === 0) return 'KHONG_CO_KHUNG_GIO';
          await em.query(
            "UPDATE khung_gio SET trang_thai = 'DaDat' WHERE khung_gio_id = ?",
            [target],
          );
          await new DoctorFixtures(em).admin.appointment(
            w.doctor.profile,
            { khungGioId: target, ngayGio: new Date() } as KhungGio,
            patient.account.taiKhoanId,
            { trangThai: 'DaXacNhan' },
          );
          return 'DAT_DUOC';
        });
      };

      const [del, book] = await Promise.all([deleting(), booking()]);
      const shiftLeft = Number(
        (
          await db.query(
            'SELECT COUNT(*) AS so FROM lich_lam_viec WHERE lich_lam_viec_id = ?',
            [shift.lichLamViecId],
          )
        )[0].so,
      );
      const slotsLeft = Number(
        (
          await db.query(
            'SELECT COUNT(*) AS so FROM khung_gio WHERE lich_lam_viec_id = ?',
            [shift.lichLamViecId],
          )
        )[0].so,
      );
      if (del.status === 204) {
        // Gỡ trước: đặt lịch báo không còn khung giờ; không ca, không khung giờ nào còn lại.
        expect(book, `vòng ${round}`).toBe('KHONG_CO_KHUNG_GIO');
        expect([shiftLeft, slotsLeft], `vòng ${round}`).toEqual([0, 0]);
      } else {
        // Đặt trước: gỡ bị từ chối bằng mã nghiệp vụ (không 500); ca và khung giờ còn đủ.
        expectErrorResponse(del, 409, 'CA_DANG_CO_LICH_HEN');
        expect(book, `vòng ${round}`).toBe('DAT_DUOC');
        expect([shiftLeft, slotsLeft], `vòng ${round}`).toEqual([
          1,
          slotIds.length,
        ]);
      }
    }
    await assertInvariants(db, TODAY);
  });
});
