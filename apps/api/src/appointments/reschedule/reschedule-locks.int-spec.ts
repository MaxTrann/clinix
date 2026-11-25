import type { DataSource, EntityManager } from 'typeorm';
import { SystemConfigRepository } from '../../admin/system-config/system-config.repository.js';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import { findLockOrderViolation } from '../locking/lock-order.js';
import { BookabilityReader } from '../slots/bookability.reader.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import {
  FakeDoctorLeavePort,
  FakePendingBranchChangesPort,
} from '../testing/fake-ports.js';
import {
  expectLichLockByPrimaryKey,
  lockedTablesOf,
  lockedTablesOfDistinct,
} from '../testing/lock-chain.js';
import { firstTableOf, isLockingStatement } from '../testing/query-spy.js';
import {
  interceptStatements,
  type StatementCall,
} from '../testing/statement-recorder.js';
import {
  lockRequestCreation,
  lockRescheduleChain,
  lockRescheduleRequest,
} from './reschedule-locks.js';
import { RescheduleReader } from './reschedule.reader.js';

// reschedule B1 — HDL-13 (phần I; PLAN reschedule 5.4, 7.9) trên MySQL 8.4 THẬT: chuỗi câu khoá THẬT của `reschedule-locks.ts` đúng thứ tự bảng 5.4, mọi hàng được khoá THẬT (một kết nối khác không khoá nổi),
// hai khung giờ id '9' và '10' (so BigInt), và chuỗi này ghép được với `RescheduleReader.read(…, 'locked')` của B2 mà không bị báo nhầm. Phần đơn vị (kịch bản `Missing`, `RangeError`): reschedule-locks.spec.ts.
// Ô i của thế giới đặt được bắt đầu lúc 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026 (CaSang, id 1 đến 8); ca chiều (id 9 đến 16) dựng thêm để có id '9' và '10'.
const NOW = new Date('2026-11-02T09:00:00+07:00');
const ER_LOCK_NOWAIT = 3572;

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

async function world() {
  const w = await fx.world();
  await fx.systemConfig({ soLanTuDoiLichToiDa: 2 });
  const patientId = w.patient.account.taiKhoanId;
  const doctor = w.doctor.profile;
  const afternoon = await fx.doctor.shiftWithSlots(doctor, {
    ngay: '2026-11-10',
    ca: 'CaChieu',
  });
  const reader = new RescheduleReader(
    new BookabilityReader(
      new BranchHoursReader(),
      new FakeDoctorLeavePort(),
      new FakePendingBranchChangesPort(),
    ),
    new SystemConfigService(new SystemConfigRepository(db)),
  );
  /** Lịch cũ `DaXacNhan` của Bệnh nhân ở khung giờ `khungGioId` (kèm hồ sơ người thân nếu có) */
  const old = (khungGioId: string, hoSoNguoiThanId?: string) =>
    fx.appointmentIn('DaXacNhan', {
      doctor,
      khungGioId,
      patientId,
      ...(hoSoNguoiThanId === undefined ? {} : { hoSoNguoiThanId }),
    });
  const target = (lichHenId: string, hoSoNguoiThanId: string | null) => ({
    benhNhanId: patientId,
    hoSoNguoiThanId,
    bacSiId: doctor.taiKhoanId,
    lichHenId,
  });
  return {
    ...w,
    patientId,
    afternoonIds: afternoon.slotIds,
    reader,
    old,
    target,
  };
}

// `interceptStatements` chỉ được gọi MỘT lần mỗi test (gọi hai lần thì hai lớp bọc `createQueryRunner` chồng nhau, tràn ngăn xếp): cài ở lần `record` đầu của test, các lần sau cắt lấy phần câu của riêng mình.
let seen: StatementCall[] | undefined;
beforeEach(() => {
  seen = undefined;
});

/** Ghi lại câu SQL (kèm tham số) của MỘT giao dịch READ COMMITTED chạy `work`. */
async function record<T>(
  work: (em: EntityManager) => Promise<T>,
): Promise<{ result: T; calls: StatementCall[] }> {
  if (seen === undefined) {
    const installed: StatementCall[] = [];
    interceptStatements(db, (call, run) => {
      installed.push(call);
      return run();
    });
    seen = installed;
  }
  const from = seen.length;
  const result = await db.transaction('READ COMMITTED', work);
  return { result, calls: seen.slice(from) };
}

const lockingCalls = (calls: StatementCall[]) =>
  calls.filter((call) => isLockingStatement(call.sql));

async function insertRequest(
  lichHenId: string,
  khungGioMongMuonId: string,
): Promise<string> {
  const result: { insertId: number | string } = await db.query(
    `INSERT INTO yeu_cau_doi_lich_ngoai_chinh_sach (lich_hen_id, khung_gio_mong_muon_id, ly_do_yeu_cau, trang_thai, thoi_diem_tao)
     VALUES (?, ?, 'Lý do mẫu', 'ChoDuyet', '2026-11-02 08:00:00')`,
    [lichHenId, khungGioMongMuonId],
  );
  return String(result.insertId);
}

describe('HDL-13 lockRescheduleChain: chuỗi câu THẬT', () => {
  it.each([
    [
      'hồ sơ BẢN THÂN',
      false,
      ['benh_nhan', 'bac_si', 'khung_gio', 'khung_gio', 'lich_hen'],
    ],
    [
      'hồ sơ NGƯỜI THÂN',
      true,
      [
        'benh_nhan',
        'ho_so_nguoi_than',
        'bac_si',
        'khung_gio',
        'khung_gio',
        'lich_hen',
      ],
    ],
  ])(
    '%s: đúng thứ tự bảng 5.4, mọi câu là khoá hàng, không vi phạm findLockOrderViolation; lich_hen CHỈ theo khoá chính',
    async (_name, withRelative, expectedTables) => {
      const w = await world();
      const old = await w.old(
        w.slotIds[0]!,
        withRelative ? w.relativeId : undefined,
      );

      const { result, calls } = await record((em) =>
        lockRescheduleChain(em, {
          ...w.target(old.lichHenId, withRelative ? w.relativeId : null),
          khungGioCuId: w.slotIds[0]!,
          khungGioMoiId: w.slotIds[2]!,
        }),
      );

      expect(result.kind).toBe('Locked');
      const locking = lockingCalls(calls);
      expect(locking.map((call) => firstTableOf(call.sql))).toEqual(
        expectedTables,
      );
      expect(findLockOrderViolation(lockedTablesOfDistinct(calls))).toBeNull();
      expectLichLockByPrimaryKey(locking.at(-1)?.sql ?? '');
      // không câu nào khác khoá hay ghi: chuỗi chỉ gồm các câu khoá hàng
      expect(
        calls.filter((call) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(call.sql)),
      ).toEqual([]);
    },
  );

  it('hai khung giờ id "9" và "10" (cũ = 10, mới = 9): khoá 9 RỒI 10 trên MySQL thật; slotCu là id 10, slotMoi là id 9', async () => {
    const w = await world();
    expect(w.afternoonIds.slice(0, 2)).toEqual(['9', '10']);
    const old = await w.old('10');

    const { result, calls } = await record((em) =>
      lockRescheduleChain(em, {
        ...w.target(old.lichHenId, null),
        khungGioCuId: '10',
        khungGioMoiId: '9',
      }),
    );

    const slotLocks = lockingCalls(calls).filter(
      (call) => firstTableOf(call.sql) === 'khung_gio',
    );
    expect(slotLocks.map((call) => call.params?.[0])).toEqual(['9', '10']);
    if (result.kind !== 'Locked') throw new Error('phải Locked');
    expect(result.slotCu.khungGioId).toBe('10');
    expect(result.slotCu.trangThai).toBe('DaDat');
    expect(result.slotMoi.khungGioId).toBe('9');
    expect(result.slotMoi.trangThai).toBe('ConTrong');
    expect(result.appointment.trangThai).toBe('DaXacNhan');
  });

  it('mọi hàng được khoá THẬT: một kết nối khác xin FOR UPDATE NOWAIT trên từng hàng đều bị từ chối (3572) khi giao dịch còn mở', async () => {
    const w = await world();
    const old = await w.old(w.slotIds[0]!, w.relativeId);
    const requestId = await insertRequest(old.lichHenId, w.slotIds[2]!);
    const held: [string, string, string][] = [
      ['benh_nhan', 'tai_khoan_id', w.patientId],
      ['ho_so_nguoi_than', 'ho_so_nguoi_than_id', w.relativeId],
      ['bac_si', 'tai_khoan_id', w.doctor.account.taiKhoanId],
      ['khung_gio', 'khung_gio_id', w.slotIds[0]!],
      ['khung_gio', 'khung_gio_id', w.slotIds[2]!],
      ['lich_hen', 'lich_hen_id', old.lichHenId],
      [
        'yeu_cau_doi_lich_ngoai_chinh_sach',
        'yeu_cau_doi_lich_ngoai_chinh_sach_id',
        requestId,
      ],
    ];

    const errnos = await db.transaction('READ COMMITTED', async (em) => {
      const locks = await lockRescheduleChain(em, {
        ...w.target(old.lichHenId, w.relativeId),
        khungGioCuId: w.slotIds[0]!,
        khungGioMoiId: w.slotIds[2]!,
        yeuCauId: requestId,
      });
      expect(locks.kind).toBe('Locked');
      const found: (number | undefined)[] = [];
      for (const [table, column, id] of held)
        found.push(
          await db
            .query(
              `SELECT 1 FROM ${table} WHERE ${column} = ? FOR UPDATE NOWAIT`,
              [id],
            )
            .then(
              () => undefined,
              (error: { errno?: number }) => error.errno,
            ),
        );
      return found;
    });

    expect(errnos).toEqual(held.map(() => ER_LOCK_NOWAIT));
  });

  it('khung giờ đích không tồn tại ⇒ Missing khung_gio và KHÔNG xin lich_hen; benh_nhan không tồn tại ⇒ Missing benh_nhan và dừng ở câu đầu', async () => {
    const w = await world();
    const old = await w.old(w.slotIds[0]!);

    const noSlot = await record((em) =>
      lockRescheduleChain(em, {
        ...w.target(old.lichHenId, null),
        khungGioCuId: w.slotIds[0]!,
        khungGioMoiId: '999999',
      }),
    );
    expect(noSlot.result).toEqual({ kind: 'Missing', table: 'khung_gio' });
    expect(
      lockingCalls(noSlot.calls).map((call) => firstTableOf(call.sql)),
    ).not.toContain('lich_hen');

    const noPatient = await record((em) =>
      lockRescheduleChain(em, {
        ...w.target(old.lichHenId, null),
        benhNhanId: '999999',
        khungGioCuId: w.slotIds[0]!,
        khungGioMoiId: w.slotIds[2]!,
      }),
    );
    expect(noPatient.result).toEqual({ kind: 'Missing', table: 'benh_nhan' });
    expect(lockingCalls(noPatient.calls)).toHaveLength(1);
  });
});

describe('HDL-13 yêu cầu (tầng 6c) và nhánh tạo yêu cầu trên MySQL thật', () => {
  it('duyệt: yêu cầu khoá SAU lich_hen theo khoá chính và được trả đúng; chuỗi (kể cả 6c) không vi phạm thứ tự khoá', async () => {
    const w = await world();
    const old = await w.old(w.slotIds[0]!);
    const requestId = await insertRequest(old.lichHenId, w.slotIds[2]!);

    const { result, calls } = await record((em) =>
      lockRescheduleChain(em, {
        ...w.target(old.lichHenId, null),
        khungGioCuId: w.slotIds[0]!,
        khungGioMoiId: w.slotIds[2]!,
        yeuCauId: requestId,
      }),
    );

    const tables = lockedTablesOf(calls.map((call) => call.sql));
    expect(tables.at(-2)).toBe('lich_hen');
    expect(tables.at(-1)).toBe('yeu_cau_doi_lich_ngoai_chinh_sach');
    expect(findLockOrderViolation(tables)).toBeNull();
    if (result.kind !== 'Locked') throw new Error('phải Locked');
    expect(result.request).toEqual({
      yeuCauId: requestId,
      lichHenId: old.lichHenId,
      khungGioMongMuonId: w.slotIds[2],
      trangThai: 'ChoDuyet',
    });
  });

  it('yêu cầu không tồn tại ⇒ Missing yeu_cau_doi_lich_ngoai_chinh_sach (đã khoá hết các tầng trước)', async () => {
    const w = await world();
    const old = await w.old(w.slotIds[0]!);

    const { result } = await record((em) =>
      lockRescheduleChain(em, {
        ...w.target(old.lichHenId, null),
        khungGioCuId: w.slotIds[0]!,
        khungGioMoiId: w.slotIds[2]!,
        yeuCauId: '999999',
      }),
    );

    expect(result).toEqual({
      kind: 'Missing',
      table: 'yeu_cau_doi_lich_ngoai_chinh_sach',
    });
  });

  it('từ chối chỉ khoá hàng yêu cầu: MỘT câu FOR UPDATE, không câu khoá nào khác', async () => {
    const w = await world();
    const old = await w.old(w.slotIds[0]!);
    const requestId = await insertRequest(old.lichHenId, w.slotIds[2]!);

    const { result, calls } = await record((em) =>
      lockRescheduleRequest(em, requestId),
    );

    expect(lockingCalls(calls)).toHaveLength(1);
    expect(result?.trangThai).toBe('ChoDuyet');
    await db.transaction('READ COMMITTED', async (em) => {
      expect(await lockRescheduleRequest(em, '999999')).toBeNull();
    });
  });

  it('tạo yêu cầu: benh_nhan, bac_si, MỘT khung_gio (mong muốn) TRƯỚC lich_hen; không khoá hàng yêu cầu (chưa có); INSERT yêu cầu chạy SAU hai hàng cha đã khoá (R2)', async () => {
    const w = await world();
    const old = await w.old(w.slotIds[0]!);

    const { result, calls } = await record(async (em) => {
      const locks = await lockRequestCreation(em, {
        ...w.target(old.lichHenId, null),
        khungGioMongMuonId: w.slotIds[2]!,
      });
      // chỉ SAU khi hai hàng cha đã khoá mới INSERT (R2): xin S trên khung_gio và lich_hen là xin lại hàng đã giữ
      await em.query(
        `INSERT INTO yeu_cau_doi_lich_ngoai_chinh_sach (lich_hen_id, khung_gio_mong_muon_id, ly_do_yeu_cau, trang_thai, thoi_diem_tao)
         VALUES (?, ?, 'Lý do mẫu', 'ChoDuyet', '2026-11-02 08:00:00')`,
        [old.lichHenId, w.slotIds[2]],
      );
      return locks;
    });

    expect(result.kind).toBe('Locked');
    expect(lockingCalls(calls).map((call) => firstTableOf(call.sql))).toEqual([
      'benh_nhan',
      'bac_si',
      'khung_gio',
      'lich_hen',
    ]);
    expect(findLockOrderViolation(lockedTablesOfDistinct(calls))).toBeNull();
  });
});

describe('HDL-13, HDL-16 ghép với RescheduleReader.read(…, "locked") của B2', () => {
  it('sau chuỗi khoá thật, read(locked) chạy được; chuỗi câu gộp: bản KHÔNG lọc báo nhầm "tầng 4 sau tầng 6", bản lockedTablesOfDistinct thì không', async () => {
    const w = await world();
    const old = await w.old(w.slotIds[0]!);
    const actor = { via: 'TuDoi', accountId: w.patientId } as const;

    const { result, calls } = await record(async (em) => {
      const located = await w.reader.locate(em, {
        actor,
        maLichHen: old.maLichHen,
        khungGioMoiId: w.slotIds[2]!,
      });
      if (located === null) throw new Error('phải tìm thấy lịch');
      await lockRescheduleChain(em, {
        benhNhanId: located.benhNhanId,
        hoSoNguoiThanId: located.hoSoNguoiThanId,
        bacSiId: located.bacSiId,
        lichHenId: located.lichHenId,
        khungGioCuId: located.khungGioCuId,
        khungGioMoiId: w.slotIds[2]!,
      });
      return w.reader.read(
        em,
        {
          actor,
          maLichHen: old.maLichHen,
          khungGioMoiId: w.slotIds[2]!,
          now: NOW,
          config: await w.reader.config(),
          requestReasonGiven: false,
        },
        'locked',
      );
    });

    expect(result.facts.source?.trangThai).toBe('DaXacNhan');
    expect(result.facts.bookability).not.toBeNull();
    expect(
      findLockOrderViolation(lockedTablesOf(calls.map((call) => call.sql))),
    ).toMatchObject({ truoc: 'lich_hen', sau: 'bac_si' });
    expect(findLockOrderViolation(lockedTablesOfDistinct(calls))).toBeNull();
  });
});
