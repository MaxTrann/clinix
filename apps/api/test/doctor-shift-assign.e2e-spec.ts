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
import { resetTables } from '../src/database/testing/test-database.js';
import { ShiftAssignmentRepository } from '../src/doctor/shifts/shift-assignment.repository.js';
import { createGate } from '../src/doctor/testing/concurrency-harness.js';
import { DoctorFixtures } from '../src/doctor/testing/doctor-fixtures.js';
import { assertInvariants } from '../src/doctor/testing/invariants.js';
import {
  formatCalendarDate,
  isoWeekdayOfEpochDay,
  parseCalendarDate,
} from '../src/scheduling/calendar-date.js';

// Doctor B3 — POST /admin/doctor-shifts (ghi) qua HTTP thật + MySQL thật:
// PC-01, PC-02, PC-13, PC-18, PC-24, PC-27, PC-28, DH-01, DH-03, DH-04, DH-09.
describe('B3 — phân công ca (ghi)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: DoctorFixtures;
  let sessions: SessionService;
  const url = '/admin/doctor-shifts';
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
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => app?.close());

  const tokenOf = async (accountId: string) =>
    (await sessions.create(accountId)).accessToken;
  const assign = (body: object, token: string) =>
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
  /** Quy tắc đúng một ngày `ngay` (tự tính thứ trong tuần). */
  const oneDay = (bacSiIds: string[], ngay: string, over: object = {}) =>
    rule(bacSiIds, {
      tuNgay: ngay,
      denNgay: ngay,
      thuTrongTuan: [isoWeekdayOfEpochDay(parseCalendarDate(ngay) as number)],
      ...over,
    });
  const dayAfter = (ngay: string, offset: number) =>
    formatCalendarDate((parseCalendarDate(ngay) as number) + offset);
  const count = async (table: string) =>
    Number((await db.query(`SELECT COUNT(*) AS so FROM ${table}`))[0].so);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function setup() {
    const world = await fx.world();
    return {
      ...world,
      doctorId: world.doctor.account.taiKhoanId,
      systemToken: await tokenOf(world.systemAdmin.account.taiKhoanId),
      branchToken: await tokenOf(world.branchAdmin.account.taiKhoanId),
    };
  }

  it('PC-01 phân công một ca hợp lệ: 201, ca mang chi nhánh hiện tại của bác sĩ, đủ khung giờ', async () => {
    const { branch, doctorId, systemToken } = await setup();
    const res = await assign(rule([doctorId]), systemToken).expect(201);
    expect(res.body).toEqual({
      soCa: 1,
      soKhungGio: 8,
      theoBacSi: [{ bacSiId: doctorId, soCa: 1 }],
    });
    const shifts: { chiNhanhId: string; ca: string; ngay: string }[] =
      await db.query(
        "SELECT CAST(chi_nhanh_id AS CHAR) AS chiNhanhId, ca, DATE_FORMAT(ngay, '%Y-%m-%d') AS ngay FROM lich_lam_viec",
      );
    expect(shifts).toEqual([
      { chiNhanhId: branch.chiNhanhId, ca: 'CaSang', ngay: MON },
    ]);
    expect(await count('khung_gio')).toBe(8);
  });

  it('PC-01 (nhiều bác sĩ, cả ngày, nhiều tuần) ghi đủ ca và khung giờ trong một lần', async () => {
    const { branch, doctorId, systemToken } = await setup();
    const second = await fx.admin.doctor(branch);
    const res = await assign(
      rule([doctorId, second.account.taiKhoanId], {
        denNgay: '2026-12-11',
        thuTrongTuan: [1, 2, 3, 4, 5],
        cas: ['CaSang', 'CaChieu'],
      }),
      systemToken,
    ).expect(201);
    expect(res.body).toMatchObject({ soCa: 20, soKhungGio: 160 });
    expect(await count('lich_lam_viec')).toBe(20);
    expect(await count('khung_gio')).toBe(160);
  });

  it('PC-02 gửi kèm chiNhanhId ⇒ 400 TRUONG_KHONG_DUOC_PHEP và không ghi gì', async () => {
    const { branch, doctorId, systemToken } = await setup();
    const res = await assign(
      rule([doctorId], { chiNhanhId: branch.chiNhanhId }),
      systemToken,
    );
    const body = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
    expect(body.loi).toEqual([
      { truong: 'chiNhanhId', ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
    expect(await count('lich_lam_viec')).toBe(0);
  });

  it('PC-02/PC-27 bác sĩ đổi chi nhánh sau đó: ca cũ giữ chi nhánh cũ, ca mới mang chi nhánh mới (IV-01)', async () => {
    const { branch, doctorId, systemToken } = await setup();
    await assign(rule([doctorId]), systemToken).expect(201);

    const other = await fx.admin.branch();
    await fx.admin.weeklySchedule(other.chiNhanhId);
    await db.query(
      'UPDATE bac_si SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [other.chiNhanhId, doctorId],
    );
    await assign(rule([doctorId], { cas: ['CaChieu'] }), systemToken).expect(
      201,
    );

    const rows: { ca: string; chiNhanhId: string }[] = await db.query(
      'SELECT ca, CAST(chi_nhanh_id AS CHAR) AS chiNhanhId FROM lich_lam_viec ORDER BY lich_lam_viec_id',
    );
    // Thứ tự ghi: ca cũ (CaSang, chi nhánh cũ) rồi ca mới (CaChieu, chi nhánh mới).
    expect(rows).toEqual([
      { ca: 'CaSang', chiNhanhId: branch.chiNhanhId },
      { ca: 'CaChieu', chiNhanhId: other.chiNhanhId },
    ]);
  });

  it('PC-13 đua giả lập: ca trùng chèn giữa lúc kiểm và lúc ghi ⇒ 409 CA_DA_PHAN_CONG (lưới UNIQUE), không 500, hoàn tác sạch', async () => {
    const { doctor, doctorId, systemToken } = await setup();
    await fx.shiftWithSlots(doctor.profile, { ngay: MON, ca: 'CaSang' });
    // Bước kiểm "không thấy" ca đã có ⇒ chỉ còn UNIQUE của DB chặn được.
    vi.spyOn(
      app.get(ShiftAssignmentRepository),
      'findExistingShiftKeys',
    ).mockResolvedValue(new Set());
    const shiftsBefore = await count('lich_lam_viec');
    const slotsBefore = await count('khung_gio');

    const res = await assign(
      rule([doctorId], { cas: ['CaSang', 'CaChieu'] }),
      systemToken,
    );
    expectErrorResponse(res, 409, 'CA_DA_PHAN_CONG');
    expect(await count('lich_lam_viec')).toBe(shiftsBefore);
    expect(await count('khung_gio')).toBe(slotsBefore);
  });

  it('PC-17 có vi phạm ⇒ 409 mang mã của vi phạm đầu tiên kèm viPham[] và không ghi gì (all-or-none)', async () => {
    const { doctor, doctorId, systemToken } = await setup();
    await fx.shiftWithSlots(doctor.profile, { ngay: MON, ca: 'CaSang' });
    const shiftsBefore = await count('lich_lam_viec');

    const res = await assign(
      rule([doctorId], { cas: ['CaSang', 'CaChieu'] }),
      systemToken,
    );
    const body = expectErrorResponse(res, 409, 'CA_DA_PHAN_CONG');
    expect(body.chiTiet).toMatchObject({
      tongSoViPham: 1,
      viPham: [{ bacSiId: doctorId, ngay: MON, ca: 'CaSang' }],
    });
    // CaChieu hợp lệ nhưng không được ghi vì cả yêu cầu bị từ chối.
    expect(await count('lich_lam_viec')).toBe(shiftsBefore);
  });

  it('PC-18 Admin Chi nhánh: bác sĩ chi nhánh mình thành công; chi nhánh khác ⇒ 404 cùng thân với bác sĩ không tồn tại', async () => {
    const { branchToken, doctorId } = await setup();
    const otherBranch = await fx.admin.branch();
    await fx.admin.weeklySchedule(otherBranch.chiNhanhId);
    const foreign = await fx.admin.doctor(otherBranch);

    await assign(rule([doctorId]), branchToken).expect(201);

    const foreignRes = await assign(
      rule([foreign.account.taiKhoanId]),
      branchToken,
    );
    expectErrorResponse(foreignRes, 404, 'KHONG_TIM_THAY');
    const missingRes = await assign(rule(['999999999']), branchToken);
    expectErrorResponse(missingRes, 404, 'KHONG_TIM_THAY');
    expect(foreignRes.body).toEqual(missingRes.body);
    expect(await count('lich_lam_viec')).toBe(1);
  });

  it('PC-18 vai trò sai (Lễ tân, Bác sĩ) ⇒ 403, không ghi', async () => {
    const { receptionist, doctor, doctorId } = await setup();
    for (const account of [receptionist.account, doctor.account]) {
      const res = await assign(
        rule([doctorId]),
        await tokenOf(account.taiKhoanId),
      );
      expect(res.status).toBe(403);
    }
    expect(await count('lich_lam_viec')).toBe(0);
  });

  it('PC-24 audit: mỗi bác sĩ một dòng PhanCongLichLamViec đúng payload, đối tượng là bác sĩ, chi nhánh của bác sĩ', async () => {
    const { branch, doctorId, systemAdmin, systemToken } = await setup();
    const second = await fx.admin.doctor(branch);
    await assign(
      rule([doctorId, second.account.taiKhoanId], {
        denNgay: '2026-12-08',
        thuTrongTuan: [1, 2],
        cas: ['CaSang', 'CaChieu'],
      }),
      systemToken,
    ).expect(201);

    const logs: {
      actor: string;
      branch: string;
      action: string;
      type: string;
      target: string;
      result: string;
      changes: Record<string, unknown> | string;
    }[] = await db.query(
      `SELECT CAST(tai_khoan_id AS CHAR) AS actor, CAST(chi_nhanh_id AS CHAR) AS branch, hanh_dong AS action,
              loai_doi_tuong AS type, CAST(ma_doi_tuong AS CHAR) AS target, ket_qua AS result, chi_tiet_thay_doi AS changes
         FROM nhat_ky_hanh_dong ORDER BY ma_doi_tuong`,
    );
    expect(logs).toHaveLength(2);
    expect(logs.map((l) => l.target).sort()).toEqual(
      [doctorId, second.account.taiKhoanId].sort(),
    );
    for (const log of logs) {
      expect(log).toMatchObject({
        actor: systemAdmin.account.taiKhoanId,
        branch: branch.chiNhanhId,
        action: 'PhanCongLichLamViec',
        type: 'tai_khoan',
        result: 'ThanhCong',
      });
      const changes =
        typeof log.changes === 'string' ? JSON.parse(log.changes) : log.changes;
      expect(changes).toEqual({
        tu_ngay: MON,
        den_ngay: '2026-12-08',
        thu_trong_tuan: [1, 2],
        ca: ['CaSang', 'CaChieu'],
        so_ca: 4,
      });
    }
  });

  it('PC-24 audit lỗi ⇒ hoàn tác cả ca lẫn khung giờ (không ghi nửa chừng)', async () => {
    const { doctorId, systemToken } = await setup();
    vi.spyOn(app.get(AuditService), 'record').mockRejectedValue(
      new AuditError('AUDIT_WRITE_FAILED'),
    );
    const res = await assign(rule([doctorId]), systemToken);
    expect(res.status).toBe(500);
    expect(await count('lich_lam_viec')).toBe(0);
    expect(await count('khung_gio')).toBe(0);
  });

  it('PC-28 phân công không đổi trang_thai/giu_cho_den của khung giờ đã có', async () => {
    const { doctor, doctorId, systemToken } = await setup();
    const { slotIds } = await fx.shiftWithSlots(doctor.profile, {
      ngay: MON,
      ca: 'CaSang',
    });
    await db.query(
      "UPDATE khung_gio SET trang_thai = 'DangGiuCho', giu_cho_den = '2026-12-07 07:30:00' WHERE khung_gio_id = ?",
      [slotIds[0]],
    );
    // CaChieu cùng ngày là ca mới; CaSang đã có nên không nằm trong yêu cầu.
    await assign(rule([doctorId], { cas: ['CaChieu'] }), systemToken).expect(
      201,
    );
    const rows: { trangThai: string; giuChoDen: string | null }[] =
      await db.query(
        "SELECT trang_thai AS trangThai, DATE_FORMAT(giu_cho_den, '%Y-%m-%d %H:%i:%s') AS giuChoDen FROM khung_gio WHERE khung_gio_id = ?",
        [slotIds[0]],
      );
    expect(rows).toEqual([
      { trangThai: 'DangGiuCho', giuChoDen: '2026-12-07 07:30:00' },
    ]);
  });

  it('DH-01 hai Admin cùng phân công một ca (30 vòng): đúng một 201, bên kia 409 CA_DA_PHAN_CONG, không 500', async () => {
    const { doctorId, systemToken, branchToken } = await setup();
    for (let round = 0; round < 30; round += 1) {
      const ngay = dayAfter(MON, round);
      const gate = createGate(2);
      const send = async (token: string) => {
        await gate.arrive();
        return assign(oneDay([doctorId], ngay), token);
      };
      const [a, b] = await Promise.all([send(systemToken), send(branchToken)]);
      const statuses = [a.status, b.status].sort((x, y) => x - y);
      expect(statuses, `vòng ${round}`).toEqual([201, 409]);
      const loser = a.status === 409 ? a : b;
      expect(loser.body.maLoi).toBe('CA_DA_PHAN_CONG');
    }
    expect(await count('lich_lam_viec')).toBe(30);
    await assertInvariants(db, '2026-11-09');
  });

  it('DH-03 phân công đua với đổi chi nhánh bác sĩ: tuần tự, ca mang đúng chi nhánh mới, IV-01 đúng', async () => {
    const { doctorId, systemToken } = await setup();
    const other = await fx.admin.branch();
    await fx.admin.weeklySchedule(other.chiNhanhId);

    // Giả Admin đổi chi nhánh: khoá bac_si X, giữ 300 ms rồi mới cập nhật và nhả.
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction('READ COMMITTED');
    await runner.query(
      'SELECT tai_khoan_id FROM bac_si WHERE tai_khoan_id = ? FOR UPDATE',
      [doctorId],
    );
    const pending = assign(rule([doctorId]), systemToken).then((r) => r);
    await sleep(300);
    await runner.query(
      'UPDATE bac_si SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [other.chiNhanhId, doctorId],
    );
    await runner.commitTransaction();
    await runner.release();

    const res = await pending;
    expect(res.status).toBe(201);
    const rows: { chiNhanhId: string }[] = await db.query(
      'SELECT CAST(chi_nhanh_id AS CHAR) AS chiNhanhId FROM lich_lam_viec',
    );
    expect(rows).toEqual([{ chiNhanhId: other.chiNhanhId }]);
    await assertInvariants(db, '2026-11-09');
  });

  it('DH-04 phân công đua với đổi thoi_luong: khung giờ khớp thời lượng cuối (45 phút ⇒ 5 ô), không deadlock', async () => {
    const { doctor, doctorId, systemToken } = await setup();
    const serviceId = String(doctor.profile.dichVuKhamId);

    // Giả lệnh sửa dịch vụ của admin: khoá dich_vu_kham FOR UPDATE, không xin bac_si.
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction('READ COMMITTED');
    await runner.query(
      'SELECT dich_vu_kham_id FROM dich_vu_kham WHERE dich_vu_kham_id = ? FOR UPDATE',
      [serviceId],
    );
    const pending = assign(rule([doctorId]), systemToken).then((r) => r);
    await sleep(300);
    await runner.query(
      'UPDATE dich_vu_kham SET thoi_luong = 45 WHERE dich_vu_kham_id = ?',
      [serviceId],
    );
    await runner.commitTransaction();
    await runner.release();

    const res = await pending;
    expect(res.status).toBe(201);
    expect(res.body.soKhungGio).toBe(5);
    expect(await count('khung_gio')).toBe(5);
  });

  it('DH-09 nhiều bác sĩ theo thứ tự chéo (A:[1,2], B:[2,1]) chạy đua 10 vòng: 0 deadlock, cả hai 201', async () => {
    const { branch, doctorId, systemToken, branchToken } = await setup();
    const second = (await fx.admin.doctor(branch)).account.taiKhoanId;
    for (let round = 0; round < 10; round += 1) {
      const gate = createGate(2);
      const send = async (ids: string[], day: string, token: string) => {
        await gate.arrive();
        return assign(oneDay(ids, day), token);
      };
      const [a, b] = await Promise.all([
        send([doctorId, second], dayAfter(MON, round * 2), systemToken),
        send([second, doctorId], dayAfter(MON, round * 2 + 1), branchToken),
      ]);
      expect([a.status, b.status], `vòng ${round}`).toEqual([201, 201]);
    }
    expect(await count('lich_lam_viec')).toBe(40);
  });
});
