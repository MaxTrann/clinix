import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import { findLockOrderViolation } from '../locking/lock-order.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import {
  createRealCreateService,
  readEmails,
  readThongBao,
} from '../testing/notification-world.js';
import { deadlockError } from '../testing/create-appointment-world.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import {
  FakeDoctorLeavePort,
  FakePendingBranchChangesPort,
} from '../testing/fake-ports.js';
import {
  assertBookingInvariants,
  assertRescheduleInvariants,
} from '../testing/invariants.js';
import { lockedTablesOfDistinct } from '../testing/lock-chain.js';
import { isLockingStatement } from '../testing/query-spy.js';
import {
  DEFAULT_REASON,
  markRequestRejected,
  requestRows,
  requestWorld,
  setSelfRescheduleCount,
  untouchedState,
  writeCounts,
} from '../testing/reschedule-request-world.js';
import { buildRescheduleChain } from '../testing/reschedule-world.js';
import {
  failAfterStatement,
  interceptStatements,
  type StatementCall,
} from '../testing/statement-recorder.js';

// reschedule B5 — XDL-01, XDL-02, DLH-04, DLH-05, XDL-21 đến XDL-26 phần I (PLAN reschedule 5.4, 5.7, 7.2, 7.4) trên MySQL 8.4 THẬT: `RescheduleRequestService.create` với `RescheduleReader`, `lockRequestCreation`,
// `BookingNotifier` THẬT. Đồng hồ ứng dụng giả = 02/11/2026 08:00 giờ Việt Nam (`useIntegrationHooks`); lịch cũ ở ô 0 (08:00 ngày 10/11/2026), khung giờ mong muốn mặc định ở ô 2 (09:00), cấu hình `toiDa` 2.
// Đồng thời: `reschedule-request.concurrency.int-spec.ts`. Chi tiết lịch: `patient-appointment-detail.int-spec.ts`. Đơn vị (thứ tự bước, mốc `now`, lớp bảo vệ): `reschedule-request.service.spec.ts`.
const CODES = BOOKING_ERROR_CODES;
const T0_TEXT = '2026-11-02 08:00:00';

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

/** Ghi mọi câu SQL của các `QueryRunner` của `db` (kể cả giao dịch); trả mảng được điền dần. */
function record(): StatementCall[] {
  const calls: StatementCall[] = [];
  interceptStatements(db, (call, run) => {
    calls.push(call);
    return run();
  });
  return calls;
}

const INSERT_REQUEST_SQL = /INSERT INTO yeu_cau_doi_lich_ngoai_chinh_sach/;
const WRITE_SQL = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;

describe('XDL-01 tạo yêu cầu: bản ghi, lịch và khung giờ nguyên, khung giờ mong muốn vẫn trống, thông báo', () => {
  it('RequestCreated; một hàng ChoDuyet đúng cột; lịch cũ, hai khung giờ, bộ đếm no-show KHÔNG đổi; INV-1…INV-10 xanh (DLH-04)', async () => {
    const w = await requestWorld(db, fx);
    const before = await untouchedState(db);
    const outcome = await w.request();
    if (outcome.kind !== 'RequestCreated')
      return expect.fail(`kết quả ${outcome.kind}`);
    expect(outcome.thoiGianMongMuon).toStrictEqual(
      new Date('2026-11-10T09:00:00+07:00'),
    );
    expect(await requestRows(db)).toStrictEqual([
      {
        id: outcome.yeuCauId,
        lichHenId: w.old.lichHenId,
        khungGioMongMuonId: w.target,
        lyDoYeuCau: DEFAULT_REASON,
        trangThai: 'ChoDuyet',
        ghiChuXuLy: null,
        nguoiXuLyId: null,
        thoiDiemXuLy: null,
        thoiDiemTao: T0_TEXT,
      },
    ]);
    expect(await untouchedState(db)).toStrictEqual(before);
    const [targetSlot] = await db.query<{ trang_thai: string }[]>(
      'SELECT trang_thai FROM khung_gio WHERE khung_gio_id = ?',
      [w.target],
    );
    expect(targetSlot?.trang_thai).toBe('ConTrong');
    await assertBookingInvariants(db);
    await assertRescheduleInvariants(db);
  });

  it('đúng MỘT thông báo YeuCauDoiLichDangCho cho tài khoản ĐẶT (gắn yêu cầu, lich_hen_id NULL) và MỘT email ChoGui; nội dung không có lý do yêu cầu', async () => {
    const w = await requestWorld(db, fx);
    const outcome = await w.request();
    expect(outcome.kind).toBe('RequestCreated');
    const notices = await readThongBao(db);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      taiKhoanId: w.patientId,
      loai: 'YeuCauDoiLichDangCho',
      lichHenId: null,
    });
    expect(notices[0]?.noiDung).toContain(w.old.maLichHen);
    expect(notices[0]?.noiDung).not.toContain(DEFAULT_REASON);
    const emails = await readEmails(db);
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      thongBaoId: notices[0]?.thongBaoId,
      trangThai: 'ChoGui',
      soLanThu: 0,
    });
    const [link] = await db.query<{ yeuCauId: string }[]>(
      'SELECT CAST(yeu_cau_doi_lich_ngoai_chinh_sach_id AS CHAR) AS yeuCauId FROM thong_bao',
    );
    expect(link?.yeuCauId).toBe(
      outcome.kind === 'RequestCreated' ? outcome.yeuCauId : '?',
    );
  });

  it('khung giờ mong muốn KHÔNG bị giữ (Q7 (f)): người khác đặt được NGAY sau khi tạo yêu cầu, yêu cầu vẫn ChoDuyet', async () => {
    const w = await requestWorld(db, fx);
    expect((await w.request()).kind).toBe('RequestCreated');
    const [other] = await fx.patients(1);
    const created = await createRealCreateService(db).create(
      other!.account.taiKhoanId,
      { khungGioId: w.target, hoSoNguoiThanId: null, lyDoKham: null },
    );
    expect(created.maLichHen).toMatch(/^CLX-/);
    const rows = await requestRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.trangThai).toBe('ChoDuyet');
  });
});

describe('XDL-02 một ChoDuyet mỗi lịch; gửi lại sau TuChoi không bị nuốt thông báo', () => {
  it('yêu cầu thứ hai khi đã có ChoDuyet ⇒ Rejected DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET, không ghi thêm gì', async () => {
    const w = await requestWorld(db, fx);
    expect((await w.request()).kind).toBe('RequestCreated');
    const counts = await writeCounts(db);
    const before = await untouchedState(db);
    await expect(w.request()).resolves.toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'Rule', code: CODES.RESCHEDULE_REQUEST_PENDING },
    });
    expect(await writeCounts(db)).toStrictEqual(counts);
    expect(await untouchedState(db)).toStrictEqual(before);
  });

  it('sau khi yêu cầu bị từ chối gửi lại được: yêu cầu thứ hai MỚI, và thông báo thứ hai KHÔNG bị nuốt (hai thong_bao, hai email, hai yêu cầu khác nhau)', async () => {
    const w = await requestWorld(db, fx);
    const first = await w.request();
    if (first.kind !== 'RequestCreated') return expect.fail(first.kind);
    await markRequestRejected(db, first.yeuCauId, {
      nguoiXuLyId: w.patientId,
    });
    const second = await w.request({ lyDoYeuCau: 'Lý do lần hai của tôi' });
    if (second.kind !== 'RequestCreated') return expect.fail(second.kind);
    expect(second.yeuCauId).not.toBe(first.yeuCauId);
    const rows = await requestRows(db);
    expect(rows.map((row) => row.trangThai)).toStrictEqual([
      'TuChoi',
      'ChoDuyet',
    ]);
    const notices = await readThongBao(db, 'YeuCauDoiLichDangCho');
    expect(notices).toHaveLength(2);
    expect(new Set(notices.map((n) => n.thongBaoId)).size).toBe(2);
    const links = await db.query<{ yeuCauId: string }[]>(
      'SELECT CAST(yeu_cau_doi_lich_ngoai_chinh_sach_id AS CHAR) AS yeuCauId FROM thong_bao ORDER BY thong_bao_id',
    );
    expect(links.map((l) => l.yeuCauId)).toStrictEqual([
      first.yeuCauId,
      second.yeuCauId,
    ]);
    const emails = await readEmails(db);
    expect(emails.map((e) => e.trangThai)).toStrictEqual(['ChoGui', 'ChoGui']);
    await assertBookingInvariants(db);
  });

  it('đã DaDuyet hay TuChoi KHÔNG chặn gửi yêu cầu mới (chỉ ChoDuyet chặn): ba lần liên tiếp đều tạo được', async () => {
    const w = await requestWorld(db, fx);
    for (let round = 0; round < 3; round += 1) {
      const outcome = await w.request();
      if (outcome.kind !== 'RequestCreated') return expect.fail(outcome.kind);
      await markRequestRejected(db, outcome.yeuCauId, {
        nguoiXuLyId: w.patientId,
      });
    }
    expect(await requestRows(db)).toHaveLength(3);
    expect(await readThongBao(db, 'YeuCauDoiLichDangCho')).toHaveLength(3);
  });
});

describe('DLH-05 biên hạn mức: toiDa × số lần đã tự đổi', () => {
  it.each([
    [0, 0, 'RequestCreated'],
    [1, 0, 'NotOverQuota'],
    [1, 1, 'RequestCreated'],
    [2, 0, 'NotOverQuota'],
    [2, 1, 'NotOverQuota'],
    [2, 2, 'RequestCreated'],
    [2, 3, 'RequestCreated'],
  ])('toiDa %i, đã đổi %i lần ⇒ %s', async (toiDa, soLanTuDoiLich, kind) => {
    const w = await requestWorld(db, fx, {
      config: { soLanTuDoiLichToiDa: toiDa },
      soLanTuDoiLich,
    });
    const before = await untouchedState(db);
    const outcome = await w.request();
    expect(outcome.kind).toBe(kind);
    if (outcome.kind === 'NotOverQuota') {
      expect(outcome).toStrictEqual({
        kind: 'NotOverQuota',
        soLanDaDoi: soLanTuDoiLich,
        toiDa,
      });
      expect(await writeCounts(db)).toStrictEqual({
        yeuCau: 0,
        thongBao: 0,
        email: 0,
      });
    } else {
      expect(await writeCounts(db)).toStrictEqual({
        yeuCau: 1,
        thongBao: 1,
        email: 1,
      });
    }
    // Cả hai nhánh: lịch cũ (kể cả so_lan_tu_doi_lich bất biến) và khung giờ không đổi
    expect(await untouchedState(db)).toStrictEqual(before);
  });
});

describe('XDL-21 lỗi sau lần ghi: hoàn tác trọn', () => {
  it('thông báo ném SAU khi đã ghi thong_bao ⇒ lỗi đi ra nguyên; KHÔNG yêu cầu, KHÔNG thong_bao, KHÔNG email; lịch và khung giờ nguyên', async () => {
    const failure = new Error('ghi thông báo hỏng sau khi đã ghi');
    const real = (await requestWorld(db, fx)).notifier;
    const w = await requestWorld(db, fx, {
      notifier: {
        notify: async (em, event) => {
          await real.notify(em, event);
          throw failure;
        },
      },
    });
    const before = await untouchedState(db);
    await expect(w.request()).rejects.toBe(failure);
    expect(await writeCounts(db)).toStrictEqual({
      yeuCau: 0,
      thongBao: 0,
      email: 0,
    });
    expect(await untouchedState(db)).toStrictEqual(before);
    await assertBookingInvariants(db);
  });

  it('INSERT yêu cầu chạy thật rồi ném ⇒ hoàn tác: không còn hàng yêu cầu nào', async () => {
    const w = await requestWorld(db, fx);
    const failure = new Error('hỏng ngay sau INSERT yêu cầu');
    failAfterStatement(db, INSERT_REQUEST_SQL, failure);
    await expect(w.request()).rejects.toBe(failure);
    expect((await writeCounts(db)).yeuCau).toBe(0);
    expect((await writeCounts(db)).thongBao).toBe(0);
  });
});

describe('XDL-26 chạy lại thân sau 1213 (deadlock giả lập)', () => {
  it('lần chạy đầu bị 1213 SAU khi INSERT: lần hai tạo đúng MỘT yêu cầu, MỘT thông báo, cùng thoi_diem_tao (một mốc now)', async () => {
    const w = await requestWorld(db, fx);
    const matched = failAfterStatement(db, INSERT_REQUEST_SQL, deadlockError());
    const outcome = await w.request();
    expect(outcome.kind).toBe('RequestCreated');
    // INSERT chạy HAI lần (lần đầu bị hoàn tác), cùng tham số kể cả `thoi_diem_tao`
    expect(matched).toHaveLength(2);
    expect(matched[1]?.params).toStrictEqual(matched[0]?.params);
    const rows = await requestRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.thoiDiemTao).toBe(T0_TEXT);
    expect(await readThongBao(db)).toHaveLength(1);
    expect(await readEmails(db)).toHaveLength(1);
  });

  it('đồng hồ có mili giây .789: thoi_diem_tao lưu CẮT xuống giây (08:00:00), KHÔNG làm tròn lên 08:00:01 như MySQL tự làm với giá trị lẻ (đóng lỗ hổng đột biến M09 ở tầng int)', async () => {
    const w = await requestWorld(db, fx);
    vi.setSystemTime(new Date('2026-11-02T08:00:00.789+07:00'));
    expect((await w.request()).kind).toBe('RequestCreated');
    expect((await requestRows(db))[0]?.thoiDiemTao).toBe(T0_TEXT);
  });
});

describe('XDL-22 thứ tự khoá thật (PLAN 5.4, cột "Tạo yêu cầu")', () => {
  it('benh_nhan → bac_si → MỘT khung_gio (mong muốn) → lich_hen; không khoá khung giờ CŨ; không khoá hồ sơ người thân khi là bản thân', async () => {
    const w = await requestWorld(db, fx);
    const calls = record();
    expect((await w.request()).kind).toBe('RequestCreated');
    const tables = lockedTablesOfDistinct(calls);
    expect(tables).toStrictEqual([
      'benh_nhan',
      'bac_si',
      'khung_gio',
      'lich_hen',
    ]);
    expect(findLockOrderViolation(tables)).toBeNull();
    // Đúng MỘT khung giờ bị khoá, và là khung giờ MONG MUỐN
    const slotLocks = calls.filter(
      (call) =>
        isLockingStatement(call.sql) && /FROM khung_gio\b/.test(call.sql),
    );
    expect(
      new Set(slotLocks.map((c) => JSON.stringify(c.params))),
    ).toStrictEqual(new Set([JSON.stringify([w.target])]));
  });

  it('lịch của hồ sơ người thân: benh_nhan → ho_so_nguoi_than → bac_si → khung_gio → lich_hen', async () => {
    const w = await requestWorld(db, fx, { relative: 'active' });
    const calls = record();
    expect((await w.request()).kind).toBe('RequestCreated');
    const tables = lockedTablesOfDistinct(calls);
    expect(tables).toStrictEqual([
      'benh_nhan',
      'ho_so_nguoi_than',
      'bac_si',
      'khung_gio',
      'lich_hen',
    ]);
    expect(findLockOrderViolation(tables)).toBeNull();
  });

  it('mọi khoá TRƯỚC câu ghi đầu tiên; chỉ ghi yeu_cau, thong_bao, email_thong_bao; KHÔNG UPDATE lich_hen hay khung_gio', async () => {
    const w = await requestWorld(db, fx);
    const calls = record();
    expect((await w.request()).kind).toBe('RequestCreated');
    const firstWrite = calls.findIndex((call) => WRITE_SQL.test(call.sql));
    const lastLock = calls
      .map((call) => isLockingStatement(call.sql))
      .lastIndexOf(true);
    expect(firstWrite).toBeGreaterThan(lastLock);
    const written = calls
      .filter((call) => WRITE_SQL.test(call.sql))
      .map((call) => /^\s*\w+\s+(?:INTO\s+)?`?(\w+)`?/i.exec(call.sql)?.[1]);
    expect(new Set(written)).toStrictEqual(
      new Set([
        'yeu_cau_doi_lich_ngoai_chinh_sach',
        'thong_bao',
        'email_thong_bao',
      ]),
    );
    expect(
      written.filter((table) => table === 'yeu_cau_doi_lich_ngoai_chinh_sach'),
    ).toHaveLength(1);
  });
});

describe('XDL-23 từ chối SỚM: không giao dịch, không khoá, không ghi; thứ tự lỗi 5.6', () => {
  const noLockNoWrite = (calls: StatementCall[]) => {
    expect(calls.filter((call) => isLockingStatement(call.sql))).toStrictEqual(
      [],
    );
    expect(calls.filter((call) => WRITE_SQL.test(call.sql))).toStrictEqual([]);
    expect(
      calls.filter((call) => /START TRANSACTION/i.test(call.sql)),
    ).toStrictEqual([]);
  };

  it('khung giờ mong muốn của BÁC SĨ KHÁC ⇒ KHUNG_GIO_KHAC_BAC_SI', async () => {
    const w = await requestWorld(db, fx);
    const { secondDoctorOf } =
      await import('../testing/create-appointment-world.js');
    const other = await secondDoctorOf(fx, w.branch);
    const calls = record();
    await expect(
      w.request({ khungGioMongMuonId: other.slotIds[2]! }),
    ).resolves.toMatchObject({
      kind: 'Rejected',
      failure: { code: CODES.OTHER_DOCTOR_SLOT },
    });
    noLockNoWrite(calls);
    expect(await writeCounts(db)).toStrictEqual({
      yeuCau: 0,
      thongBao: 0,
      email: 0,
    });
  });

  it('trùng khung giờ CŨ ⇒ KHUNG_GIO_TRUNG_LICH_CU; khung giờ không tồn tại ⇒ KHUNG_GIO_KHONG_TON_TAI (404 qua SlotNotFound)', async () => {
    const w = await requestWorld(db, fx);
    const calls = record();
    await expect(
      w.request({ khungGioMongMuonId: w.slotIds[0]! }),
    ).resolves.toMatchObject({ failure: { code: CODES.SAME_AS_CURRENT_SLOT } });
    await expect(
      w.request({ khungGioMongMuonId: '999999999' }),
    ).resolves.toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'SlotNotFound' },
    });
    noLockNoWrite(calls);
  });

  it('thứ tự lỗi: lịch ChoThanhToan mà khung giờ của bác sĩ khác ⇒ LICH_HEN_KHONG_CHO_DOI (trạng thái trước khung giờ)', async () => {
    const w = await requestWorld(db, fx, { oldState: 'ChoThanhToan' });
    const { secondDoctorOf } =
      await import('../testing/create-appointment-world.js');
    const other = await secondDoctorOf(fx, w.branch);
    await expect(
      w.request({ khungGioMongMuonId: other.slotIds[2]! }),
    ).resolves.toMatchObject({
      failure: { code: CODES.NOT_RESCHEDULABLE },
    });
  });
});

describe('XDL-24 từ chối dưới khoá: không ghi gì', () => {
  async function expectRejected(
    world: Awaited<ReturnType<typeof requestWorld>>,
    expected: unknown,
    extra: Parameters<
      Awaited<ReturnType<typeof requestWorld>>['request']
    >[0] = {},
  ) {
    const before = await untouchedState(db);
    const counts = await writeCounts(db);
    await expect(world.request(extra)).resolves.toMatchObject(
      expected as Record<string, unknown>,
    );
    expect(await untouchedState(db)).toStrictEqual(before);
    expect(await writeCounts(db)).toStrictEqual(counts);
  }

  it.each([
    'ChoThanhToan',
    'DaTiepDon',
    'HoanThanh',
    'DaHuy',
    'VangMat',
  ] as const)(
    'lịch ở trạng thái %s ⇒ LICH_HEN_KHONG_CHO_DOI kèm trạng thái',
    async (oldState) => {
      const w = await requestWorld(db, fx, { oldState });
      await expectRejected(w, {
        kind: 'Rejected',
        failure: {
          kind: 'Rule',
          code: CODES.NOT_RESCHEDULABLE,
          chiTiet: { trangThai: oldState },
        },
      });
    },
  );

  it('lịch DaDoiLich ⇒ NotFound (cùng thân 404 với lịch không có)', async () => {
    const w = await requestWorld(db, fx, { oldState: 'DaDoiLich' });
    await expectRejected(w, {
      kind: 'Rejected',
      failure: { kind: 'NotFound' },
    });
  });

  it('lịch của NGƯỜI KHÁC và mã không tồn tại ⇒ NotFound, cùng một kết quả', async () => {
    const w = await requestWorld(db, fx);
    const [other] = await fx.patients(1);
    const stranger = await w.request({ accountId: other!.account.taiKhoanId });
    const missing = await w.request({ maLichHen: 'CLX-20261109-ZZZZZ' });
    expect(stranger).toStrictEqual(missing);
    expect(stranger).toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'NotFound' },
    });
    expect(await writeCounts(db)).toStrictEqual({
      yeuCau: 0,
      thongBao: 0,
      email: 0,
    });
  });

  it('quá giờ hẹn của lịch cũ (đúng giờ hẹn là ĐÃ qua) ⇒ LICH_HEN_DA_QUA_GIO', async () => {
    const w = await requestWorld(db, fx);
    vi.setSystemTime(new Date('2026-11-10T08:00:00+07:00'));
    await expectRejected(w, {
      failure: { kind: 'Rule', code: CODES.RESCHEDULE_TOO_LATE },
    });
  });

  it('khung giờ mong muốn đã DaDat bởi người khác ⇒ KHUNG_GIO_DA_DAT', async () => {
    const w = await requestWorld(db, fx);
    const [other] = await fx.patients(1);
    await fx.appointmentIn('DaXacNhan', {
      doctor: w.doctor,
      khungGioId: w.target,
      patientId: other!.account.taiKhoanId,
    });
    await expectRejected(w, {
      failure: { kind: 'Rule', code: CODES.SLOT_BOOKED },
    });
  });

  it('khung giờ mong muốn đã QUA (lịch cũ ở 09:30, mong muốn 08:30, bây giờ 08:45) ⇒ KHUNG_GIO_DA_QUA', async () => {
    const w = await requestWorld(db, fx, { oldSlot: 3, targetSlot: 1 });
    vi.setSystemTime(new Date('2026-11-10T08:45:00+07:00'));
    await expectRejected(w, {
      failure: { kind: 'Rule', code: CODES.SLOT_PAST },
    });
  });

  it('hồ sơ người thân đã NGỪNG ⇒ ProfileInactive', async () => {
    const w = await requestWorld(db, fx, { relative: 'stopped' });
    await expectRejected(w, {
      kind: 'Rejected',
      failure: { kind: 'ProfileInactive' },
    });
  });

  it('chuỗi 19 lịch (MAX_CHAIN_DEPTH - 1) ⇒ CHUOI_DOI_LICH_QUA_DAI; 18 lịch thì tạo được', async () => {
    const w = await requestWorld(db, fx);
    const chain = (length: number) =>
      buildRescheduleChain(db, fx, {
        doctor: w.doctor,
        patientId: w.patientId,
        khungGioId: w.slotIds[4]!,
        length,
      });
    const long = await chain(19);
    await setSelfRescheduleCount(db, long.lichHenId, 2);
    await expectRejected(
      w,
      { failure: { kind: 'Rule', code: CODES.RESCHEDULE_CHAIN_TOO_LONG } },
      { maLichHen: long.maLichHen },
    );
  });

  it('bác sĩ nghỉ phép đã duyệt trùng khung giờ mong muốn ⇒ BAC_SI_NGHI_PHEP; vùng bị loại do thay đổi chi nhánh ⇒ KHUNG_GIO_NGOAI_LICH_MOI', async () => {
    const leave = new FakeDoctorLeavePort().blocks();
    const w = await requestWorld(db, fx, { ports: { leave } });
    await expectRejected(w, {
      failure: { kind: 'Rule', code: CODES.DOCTOR_ON_LEAVE },
    });
    const pending = new FakePendingBranchChangesPort().blocks();
    const w2 = await requestWorld(db, fx, { ports: { pending } });
    await expectRejected(w2, {
      failure: { kind: 'Rule', code: CODES.SLOT_OUTSIDE_NEW_SCHEDULE },
    });
  });

  it('bác sĩ nghỉ phép: cổng được gọi DƯỚI khoá bac_si (sau câu khoá bac_si FOR SHARE)', async () => {
    const leave = new FakeDoctorLeavePort();
    const w = await requestWorld(db, fx, { ports: { leave } });
    const calls = record();
    leave.findBlockingLeaveCall.onCall(() => {
      const lockedDoctor = calls.some(
        (call) =>
          isLockingStatement(call.sql) && /FROM bac_si\b/.test(call.sql),
      );
      expect(lockedDoctor).toBe(true);
    });
    expect((await w.request()).kind).toBe('RequestCreated');
    expect(leave.findBlockingLeaveCall.count).toBe(1);
  });
});

describe('XDL-25 lý do yêu cầu: lưu đúng bản đã chuẩn hoá, không rò sang thông báo', () => {
  it('cắt khoảng trắng ASCII hai đầu, giữ xuống dòng giữa chữ và emoji; đọc lại từ DB BẰNG nhau', async () => {
    const w = await requestWorld(db, fx);
    await w.request({
      lyDoYeuCau: '  \n Lý do 😀 có emoji\nvà xuống dòng \t ',
    });
    expect((await requestRows(db))[0]?.lyDoYeuCau).toBe(
      'Lý do 😀 có emoji\nvà xuống dòng',
    );
  });

  it('500 điểm mã (emoji, gấp đôi đơn vị UTF-16 và 4 byte mỗi ký tự) lưu và đọc lại nguyên vẹn; ký tự thay thế không bị chẻ', async () => {
    const w = await requestWorld(db, fx);
    const reason = '😀'.repeat(500);
    await w.request({ lyDoYeuCau: reason });
    const stored = (await requestRows(db))[0]?.lyDoYeuCau;
    expect(stored).toBe(reason);
    expect(Array.from(stored ?? '')).toHaveLength(500);
  });

  it('lý do KHÔNG xuất hiện ở thong_bao.noi_dung (và email_thong_bao không có cột nội dung lý do)', async () => {
    const marker = 'MOI-LY-DO-RIENG-TU-7712';
    const w = await requestWorld(db, fx);
    await w.request({ lyDoYeuCau: `Tôi bận vì ${marker}` });
    const notices = await readThongBao(db);
    expect(JSON.stringify(notices)).not.toContain(marker);
    expect(JSON.stringify(await readEmails(db))).not.toContain(marker);
  });

  it.each([
    ['rỗng', ''],
    ['chỉ khoảng trắng', '  \t '],
    ['4 ký tự', 'abcd'],
    ['501 ký tự', 'x'.repeat(501)],
    ['có ký tự điều khiển', 'cần\u0000đổi lịch'],
  ])(
    'lý do %s ⇒ 400 DU_LIEU_KHONG_HOP_LE và KHÔNG chạy câu SQL nào',
    async (_name, lyDoYeuCau) => {
      const w = await requestWorld(db, fx);
      const calls = record();
      const error: unknown = await w
        .request({ lyDoYeuCau })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(400);
      expect(calls).toStrictEqual([]);
      expect(await writeCounts(db)).toStrictEqual({
        yeuCau: 0,
        thongBao: 0,
        email: 0,
      });
    },
  );

  it('biên 5 và 500 ký tự đều tạo được', async () => {
    const w = await requestWorld(db, fx);
    expect((await w.request({ lyDoYeuCau: 'abcde' })).kind).toBe(
      'RequestCreated',
    );
    await markRequestRejected(db, (await requestRows(db))[0]!.id, {
      nguoiXuLyId: w.patientId,
    });
    expect((await w.request({ lyDoYeuCau: 'z'.repeat(500) })).kind).toBe(
      'RequestCreated',
    );
  });
});

describe('thiếu cấu hình', () => {
  it('không có dòng cấu hình ⇒ 409 HE_THONG_CHUA_CAU_HINH, chưa đọc lịch nào, không ghi gì', async () => {
    const w = await requestWorld(db, fx);
    await db.query('DELETE FROM cau_hinh_he_thong');
    const calls = record();
    const error: unknown = await w.request().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(409);
    expect((error as AppException).maLoi).toBe('HE_THONG_CHUA_CAU_HINH');
    // Chỉ đọc cấu hình (bảng `cau_hinh_he_thong`, có cột `so_lich_hen_toi_da…` nên KHÔNG khớp theo chữ `lich_hen`): không câu nào đọc bảng `lich_hen`
    expect(
      calls.filter((call) => /\b(?:FROM|JOIN)\s+lich_hen\b/i.test(call.sql)),
    ).toStrictEqual([]);
  });
});
