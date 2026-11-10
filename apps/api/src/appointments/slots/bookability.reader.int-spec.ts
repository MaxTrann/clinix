import { Test } from '@nestjs/testing';
import { DataSource, type EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import { AppointmentsModule } from '../appointments.module.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { findLockOrderViolation } from '../locking/lock-order.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { holdRowLock } from '../testing/concurrency-harness.js';
import {
  FakeDoctorLeavePort,
  FakePendingBranchChangesPort,
} from '../testing/fake-ports.js';
import {
  BookabilityReader,
  type BookabilityInput,
  type BookabilityMode,
  type BookabilityRead,
} from './bookability.reader.js';
import { evaluateBookability, isLapsedHold } from './bookability.rules.js';

// Task B6a — BKR-01…BKR-10 (PLAN booking 7.23; TRACKING 3.14.5) trên MySQL 8.4 THẬT: `BookabilityReader` ở hai chế độ `none` và `locked` đọc đúng dữ kiện, giữ đúng khoá, và
// `evaluateBookability(facts)` ra đúng mã ở mức dịch vụ cho DL-03, DL-04, DL-10, DL-15, DL-16 (phần HTTP của DL-03, DL-04, DL-15 là của B8). Ô i của thế giới đặt được bắt đầu lúc
// 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026 (thứ Ba, ISO 2). `now` là THAM SỐ của reader (không đọc đồng hồ), nên mỗi ca tự chọn mốc.
const CODES = BOOKING_ERROR_CODES;
const ER_LOCK_NOWAIT = 3572;
// 09:00 ngày 02/11/2026: sau hạn giữ chỗ mặc định (08:15) của lịch ChoThanhToan trong fixture, trước mọi khung giờ của ngày 10/11
const NOW = new Date('2026-11-02T09:00:00+07:00');
// 08:05 ngày 02/11/2026: lịch ChoThanhToan của fixture (hạn 08:15) còn hạn
const NOW_BEFORE_HOLD_EXPIRES = new Date('2026-11-02T08:05:00+07:00');
const THU_BA = 2;
// Câu đọc thường ĐẦU TIÊN của `BookabilityReader.read` (khung giờ ⋈ ca): BKR-03 kiểm nó đứng trước hai câu khoá, BKR-10 chen hành động ngay sau nó
const LOCATE_STATEMENT = /FROM khung_gio kg\s+JOIN lich_lam_viec/;

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

/** Chạy một câu khoá `NOWAIT` từ MỘT KẾT NỐI KHÁC: `null` nếu khoá được ngay (không ai giữ), ngược lại số lỗi MySQL (3572 = đang bị giữ). */
async function nowaitErrno(
  sql: string,
  params: unknown[],
): Promise<number | null> {
  try {
    const lock = await holdRowLock(db, sql, params);
    await lock.release();
    return null;
  } catch (error) {
    return (
      (error as { driverError?: { errno?: number } }).driverError?.errno ?? -1
    );
  }
}

const lockDoctorNowait = (bacSiId: string, mode: 'UPDATE' | 'SHARE') =>
  nowaitErrno(
    `SELECT tai_khoan_id FROM bac_si WHERE tai_khoan_id = ? FOR ${mode} NOWAIT`,
    [bacSiId],
  );
const lockSlotNowait = (khungGioId: string, mode: 'UPDATE' | 'SHARE') =>
  nowaitErrno(
    `SELECT khung_gio_id FROM khung_gio WHERE khung_gio_id = ? FOR ${mode} NOWAIT`,
    [khungGioId],
  );

async function world() {
  const w = await fx.world();
  const patientId = w.patient.account.taiKhoanId;
  const leave = new FakeDoctorLeavePort();
  const pending = new FakePendingBranchChangesPort();
  const reader = new BookabilityReader(new BranchHoursReader(), leave, pending);
  const input = (
    slot: number,
    overrides: Partial<BookabilityInput> = {},
  ): BookabilityInput => ({
    khungGioId: w.slotIds[slot]!,
    benhNhanId: patientId,
    hoSoNguoiThanId: null,
    noShowLocked: false,
    soLichHenToiDa: 3,
    now: NOW,
    ...overrides,
  });
  /** Cả hai chế độ chạy trong một giao dịch `READ COMMITTED` (như `withBookingTransaction`); `inTx` chạy khi giao dịch còn mở (khoá còn giữ), rồi commit. */
  const read = <T = BookabilityRead>(
    mode: BookabilityMode,
    bookabilityInput: BookabilityInput,
    inTx?: (em: EntityManager, result: BookabilityRead) => Promise<T>,
  ): Promise<T> =>
    db.transaction('READ COMMITTED', async (em) => {
      const result = await reader.read(em, bookabilityInput, mode);
      return inTx ? inTx(em, result) : (result as T);
    });
  return {
    ...w,
    patientId,
    doctorId: w.doctor.account.taiKhoanId,
    leave,
    pending,
    reader,
    input,
    read,
    appt: (
      trangThai: Parameters<BookingFixtures['appointmentIn']>[0],
      slot: number,
      options: { hanThanhToan?: Date } = {},
    ) =>
      fx.appointmentIn(trangThai, {
        doctor: w.doctor.profile,
        khungGioId: w.slotIds[slot]!,
        patientId,
        ...options,
      }),
  };
}

type World = Awaited<ReturnType<typeof world>>;

/** Mã lỗi đầu tiên của `evaluateBookability` trên dữ kiện đã đọc ('ok' nếu đạt, 'SlotNotFound' nếu không có khung giờ). */
function verdictOf(read: BookabilityRead): string {
  if (read.kind === 'SlotNotFound') return 'SlotNotFound';
  const verdict = evaluateBookability(read.facts);
  return verdict.ok ? 'ok' : verdict.code;
}

/** Dữ kiện của kết quả đọc; ném lỗi nếu không có khung giờ. */
function factsOf(read: BookabilityRead) {
  if (read.kind !== 'Read') throw new Error('khung giờ phải đọc được');
  return read.facts;
}

/** Ảnh chụp ba bảng mà reader có thể (nhưng không được) ghi: so trước và sau để chứng minh "không ghi gì". */
async function snapshot(): Promise<string> {
  return JSON.stringify([
    await db.query(
      'SELECT khung_gio_id, trang_thai, giu_cho_den FROM khung_gio ORDER BY khung_gio_id',
    ),
    await db.query(
      'SELECT lich_hen_id, trang_thai, han_thanh_toan FROM lich_hen ORDER BY lich_hen_id',
    ),
    await db.query(
      'SELECT lich_lam_viec_id, chi_nhanh_id FROM lich_lam_viec ORDER BY lich_lam_viec_id',
    ),
  ]);
}

/** Bọc `em.query` của MỘT giao dịch: mỗi câu đi qua `handler(sql, run)`, `run()` chạy câu thật (BKR-03 ghi lại câu, BKR-10 chen một hành động sau câu đọc đầu tiên). */
function interceptQuery(
  em: EntityManager,
  handler: (sql: string, run: () => Promise<unknown>) => Promise<unknown>,
): void {
  const original = em.query.bind(em) as (
    sql: string,
    params?: unknown[],
  ) => Promise<unknown>;
  vi.spyOn(em, 'query').mockImplementation(((sql: string, params?: unknown[]) =>
    handler(sql, () => original(sql, params))) as typeof em.query);
}

describe('BKR-01 chế độ none: không giữ khoá nào', () => {
  it('đọc xong (giao dịch còn mở) thì phiên khác khoá được bac_si và khung_gio ngay bằng FOR UPDATE NOWAIT', async () => {
    const w = await world();
    const errnos = await w.read('none', w.input(0), async () => [
      await lockDoctorNowait(w.doctorId, 'UPDATE'),
      await lockSlotNowait(w.slotIds[0]!, 'UPDATE'),
    ]);
    expect(errnos).toEqual([null, null]);
  });
});

describe('BKR-02 chế độ locked: giữ bac_si FOR SHARE (tầng 4) và khung_gio FOR UPDATE (tầng 5)', () => {
  it('phiên khác: bac_si FOR UPDATE bị chặn, FOR SHARE được; khung_gio FOR SHARE và FOR UPDATE đều bị chặn; khoá nhả sau commit', async () => {
    const w = await world();
    const errnos = await w.read('locked', w.input(0), async (_em, result) => {
      expect(result.kind).toBe('Read');
      return {
        doctorUpdate: await lockDoctorNowait(w.doctorId, 'UPDATE'),
        doctorShare: await lockDoctorNowait(w.doctorId, 'SHARE'),
        slotShare: await lockSlotNowait(w.slotIds[0]!, 'SHARE'),
        slotUpdate: await lockSlotNowait(w.slotIds[0]!, 'UPDATE'),
        // khung giờ KHÁC của cùng ca không bị khoá
        otherSlot: await lockSlotNowait(w.slotIds[1]!, 'UPDATE'),
      };
    });
    expect(errnos).toEqual({
      doctorUpdate: ER_LOCK_NOWAIT,
      doctorShare: null,
      slotShare: ER_LOCK_NOWAIT,
      slotUpdate: ER_LOCK_NOWAIT,
      otherSlot: null,
    });
    // sau commit: không còn ai giữ
    expect(await lockDoctorNowait(w.doctorId, 'UPDATE')).toBeNull();
    expect(await lockSlotNowait(w.slotIds[0]!, 'UPDATE')).toBeNull();
  });
});

describe('BKR-03 thứ tự câu ở chế độ locked (PLAN 5.3, H2)', () => {
  it('chỉ khoá bac_si rồi khung_gio (đúng thứ tự tầng), ngay sau câu đọc thường biết khoá nào cần xin; không khoá lich_hen, lich_lam_viec, dich_vu_kham', async () => {
    const w = await world();
    const statements: string[] = [];
    await db.transaction('READ COMMITTED', async (em) => {
      interceptQuery(em, (sql, run) => {
        statements.push(sql);
        return run();
      });
      await w.reader.read(em, w.input(0), 'locked');
    });

    const isLocking = (sql: string) => /\bFOR\s+(?:UPDATE|SHARE)\b/i.test(sql);
    const tableOf = (sql: string) => /\bFROM\s+`?(\w+)`?/i.exec(sql)?.[1];
    const locking = statements.filter(isLocking);
    const tables = locking.map(tableOf);
    expect(tables).toEqual(['bac_si', 'khung_gio']);
    expect(findLockOrderViolation(tables as string[])).toBeNull();
    // đúng MỘT câu đọc thường (biết bac_si_id) đứng trước hai câu khoá; mọi câu còn lại sau chúng
    expect(statements.findIndex(isLocking)).toBe(1);
    expect(statements[0]).toMatch(LOCATE_STATEMENT);
    expect(statements.slice(1, 3).every(isLocking)).toBe(true);
    expect(statements.slice(3).some(isLocking)).toBe(false);
    // sau khi khoá còn các câu đọc thường (bác sĩ, giờ chi nhánh, lịch giữ khung giờ, lịch đang hoạt động, chồng lấn)
    expect(statements.length).toBeGreaterThan(3);
  });
});

describe('BKR-04 dữ kiện từ dữ liệu thật (A2, DL-05 phần đọc)', () => {
  it.each<BookabilityMode>(['none', 'locked'])(
    'chế độ %s: khung giờ ConTrong, DaDat, DangGiuCho còn hạn và hết hạn; khung giờ không tồn tại',
    async (mode) => {
      const w = await world();
      const booked = await w.appt('DaXacNhan', 1);
      const held = await w.appt('ChoThanhToan', 2); // hạn 08:15 ngày 02/11/2026

      const free = await w.read(mode, w.input(0));
      if (free.kind !== 'Read') throw new Error('khung giờ phải đọc được');
      expect(free.facts.slot).toEqual({
        khungGioId: w.slotIds[0],
        ngayGio: new Date('2026-11-10T08:00:00+07:00'),
        trangThai: 'ConTrong',
        giuChoDen: null,
      });
      expect(free.facts.slotHolder).toBeNull();
      expect(free.facts.doctor).toEqual({
        bacSiId: w.doctorId,
        khaDung: true,
        chiNhanhId: w.doctor.profile.chiNhanhId,
        dichVuKhamId: w.doctor.profile.dichVuKhamId,
      });
      expect(free.facts.shift).toEqual({
        chiNhanhId: w.doctor.profile.chiNhanhId,
        ca: 'CaSang',
      });
      expect(free.facts.thoiLuongPhut).toBe(30);
      expect(free.facts.ngayHoatDong).toMatchObject({ hoatDong: true });
      expect(free.facts.noShowLocked).toBe(false);
      expect(free.facts.soLichHenToiDa).toBe(3);
      expect(free.locked === null).toBe(mode === 'none');

      const bookedRead = await w.read(mode, w.input(1));
      if (bookedRead.kind !== 'Read') throw new Error('phải đọc được');
      expect(bookedRead.facts.slot.trangThai).toBe('DaDat');
      expect(bookedRead.facts.slotHolder).toBeNull(); // chỉ khung giờ DangGiuCho mới đọc lịch giữ
      expect(booked.maLichHen).toBeTruthy();

      const stillHeld = await w.read(
        mode,
        w.input(2, { now: NOW_BEFORE_HOLD_EXPIRES }),
      );
      if (stillHeld.kind !== 'Read') throw new Error('phải đọc được');
      expect(stillHeld.facts.slot.trangThai).toBe('DangGiuCho');
      expect(stillHeld.facts.slot.giuChoDen).toEqual(
        new Date('2026-11-02T08:15:00+07:00'),
      );
      expect(stillHeld.facts.slotHolder).toEqual({
        lichHenId: held.lichHenId,
        maLichHen: held.maLichHen,
      });
      expect(isLapsedHold(stillHeld.facts.slot, stillHeld.facts.now)).toBe(
        false,
      );

      const lapsed = await w.read(mode, w.input(2)); // 09:00 > hạn 08:15
      if (lapsed.kind !== 'Read') throw new Error('phải đọc được');
      expect(isLapsedHold(lapsed.facts.slot, lapsed.facts.now)).toBe(true);
      expect(evaluateBookability(lapsed.facts)).toEqual({
        ok: true,
        lapsedHold: {
          lichHenId: held.lichHenId,
          maLichHen: held.maLichHen,
        },
      });

      expect(
        await w.read(mode, w.input(0, { khungGioId: '999999999' })),
      ).toEqual({ kind: 'SlotNotFound' });
    },
  );
});

interface Scenario {
  name: string;
  /** Dựng dữ liệu (ghi thẳng bằng SQL hoặc fixture) rồi trả `input` ghi đè nếu cần */
  setup: (w: World) => Promise<Partial<BookabilityInput> & { slot?: number }>;
  expected: string;
}

const hours = (w: World, assignments: string) =>
  db.query(
    `UPDATE chi_nhanh_lich_hoat_dong SET ${assignments} WHERE chi_nhanh_id = ? AND thu_trong_tuan = ?`,
    [w.doctor.profile.chiNhanhId, THU_BA],
  );

const SCENARIOS: Scenario[] = [
  {
    name: 'DL-03 khung giờ đã DaDat',
    setup: async (w) => {
      await w.appt('DaXacNhan', 0);
      return {};
    },
    expected: CODES.SLOT_BOOKED,
  },
  {
    name: 'DL-04 khung giờ DangGiuCho còn hạn (người khác giữ)',
    setup: async (w) => {
      await w.appt('ChoThanhToan', 0);
      return { now: NOW_BEFORE_HOLD_EXPIRES };
    },
    expected: CODES.SLOT_HELD,
  },
  {
    name: 'DL-10 khung giờ đã qua (now sau giờ bắt đầu)',
    setup: () =>
      Promise.resolve({ now: new Date('2026-11-10T09:00:00+07:00') }),
    expected: CODES.SLOT_PAST,
  },
  {
    name: 'DL-10 biên: now ĐÚNG BẰNG giờ bắt đầu',
    setup: () =>
      Promise.resolve({ now: new Date('2026-11-10T08:00:00+07:00') }),
    expected: CODES.SLOT_PAST,
  },
  {
    name: 'DL-10 biên: now = giờ bắt đầu − 1 giây đặt được',
    setup: () =>
      Promise.resolve({ now: new Date('2026-11-10T07:59:59+07:00') }),
    expected: 'ok',
  },
  {
    name: 'DL-15 ngày nghỉ (hoat_dong = false)',
    setup: async (w) => {
      await hours(
        w,
        'hoat_dong = 0, gio_bat_dau_sang = NULL, gio_ket_thuc_sang = NULL, gio_bat_dau_chieu = NULL, gio_ket_thuc_chieu = NULL',
      );
      return {};
    },
    expected: CODES.BRANCH_CLOSED,
  },
  {
    name: 'DL-15 thứ chưa khai báo (không có dòng)',
    setup: async (w) => {
      await db.query(
        'DELETE FROM chi_nhanh_lich_hoat_dong WHERE chi_nhanh_id = ? AND thu_trong_tuan = ?',
        [w.doctor.profile.chiNhanhId, THU_BA],
      );
      return {};
    },
    expected: CODES.BRANCH_NOT_DECLARED,
  },
  {
    name: 'DL-15 ca không có khoảng (không có buổi sáng, khung giờ thuộc ca sáng)',
    setup: async (w) => {
      await hours(w, 'gio_bat_dau_sang = NULL, gio_ket_thuc_sang = NULL');
      return {};
    },
    expected: CODES.SHIFT_NOT_ACCEPTED,
  },
  {
    name: 'DL-15 khung giờ vượt khoảng (buổi sáng kết thúc 11:00, ô 11:30)',
    setup: async (w) => {
      await hours(w, "gio_ket_thuc_sang = '11:00:00'");
      return { slot: 7 };
    },
    expected: CODES.OUTSIDE_OPENING_HOURS,
  },
  {
    name: 'DL-15 biên: bắt đầu đúng giờ bắt đầu khoảng (08:00)',
    setup: () => Promise.resolve({ slot: 0 }),
    expected: 'ok',
  },
  {
    name: 'DL-15 biên: kết thúc đúng giờ kết thúc khoảng (buổi sáng tới 08:30, ô 08:00–08:30)',
    setup: async (w) => {
      await hours(w, "gio_ket_thuc_sang = '08:30:00'");
      return { slot: 0 };
    },
    expected: 'ok',
  },
  {
    name: 'DL-15 biên: ô liền sau khoảng (08:30–09:00 khi buổi sáng tới 08:30)',
    setup: async (w) => {
      await hours(w, "gio_ket_thuc_sang = '08:30:00'");
      return { slot: 1 };
    },
    expected: CODES.OUTSIDE_OPENING_HOURS,
  },
  {
    name: 'DL-16 tài khoản bác sĩ NgungHoatDong',
    setup: async (w) => {
      await db.query(
        "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
        [w.doctorId],
      );
      return {};
    },
    expected: CODES.DOCTOR_UNAVAILABLE,
  },
  {
    name: 'DL-16 tài khoản bác sĩ ChoKichHoat',
    setup: async (w) => {
      await db.query(
        "UPDATE tai_khoan SET trang_thai = 'ChoKichHoat', mat_khau_bam = NULL WHERE tai_khoan_id = ?",
        [w.doctorId],
      );
      return {};
    },
    expected: CODES.DOCTOR_UNAVAILABLE,
  },
  {
    name: 'DL-16 chuyên khoa NgungHoatDong',
    setup: async (w) => {
      await db.query(
        "UPDATE chuyen_khoa SET trang_thai_hoat_dong = 'NgungHoatDong' WHERE chuyen_khoa_id = ?",
        [w.doctor.profile.chuyenKhoaId],
      );
      return {};
    },
    expected: CODES.DOCTOR_UNAVAILABLE,
  },
  {
    name: 'DL-16 cặp (chi nhánh, dịch vụ) bị bỏ khỏi chi_nhanh_dich_vu_kham',
    setup: async (w) => {
      await db.query(
        'DELETE FROM chi_nhanh_dich_vu_kham WHERE chi_nhanh_id = ? AND dich_vu_kham_id = ?',
        [w.doctor.profile.chiNhanhId, w.doctor.profile.dichVuKhamId],
      );
      return {};
    },
    expected: CODES.DOCTOR_UNAVAILABLE,
  },
  {
    name: 'DL-26 ca ghi chi nhánh khác chi nhánh hiện tại của bác sĩ (D12)',
    setup: async (w) => {
      const other = await fx.admin.branch();
      await db.query(
        'UPDATE lich_lam_viec SET chi_nhanh_id = ? WHERE lich_lam_viec_id = ?',
        [other.chiNhanhId, w.shift.lichLamViecId],
      );
      return {};
    },
    expected: CODES.SLOT_INVALID,
  },
  {
    name: 'A4 khoá đặt lịch do no-show (dữ kiện từ người gọi)',
    setup: () => Promise.resolve({ noShowLocked: true }),
    expected: CODES.BOOKING_LOCKED_NO_SHOW,
  },
];

describe('BKR-05 evaluate(read(...)) trên dữ liệu thật: đúng mã ở cả hai chế độ và không ghi gì', () => {
  it.each(SCENARIOS)('$name ⇒ $expected', async ({ setup, expected }) => {
    const w = await world();
    const { slot = 0, ...overrides } = await setup(w);
    const before = await snapshot();
    const none = await w.read('none', w.input(slot, overrides));
    const locked = await w.read('locked', w.input(slot, overrides));
    expect(verdictOf(none)).toBe(expected);
    expect(verdictOf(locked)).toBe(expected);
    expect(await snapshot()).toBe(before);
  });
});

describe('BKR-06 cổng nghỉ phép và đổi chi nhánh (H5, H6, 5.10)', () => {
  it('chế độ locked: cả hai cổng được gọi DƯỚI khoá bac_si, trong chính em của người gọi, đúng tham số; chế độ none thì không có khoá', async () => {
    const w = await world();
    const seen: Record<'leave' | 'pending', (number | null)[]> = {
      leave: [],
      pending: [],
    };
    w.leave.findBlockingLeaveCall.onCall(async () => {
      seen.leave.push(await lockDoctorNowait(w.doctorId, 'UPDATE'));
    });
    w.pending.findBlockingCall.onCall(async () => {
      seen.pending.push(await lockDoctorNowait(w.doctorId, 'UPDATE'));
    });

    let lockedEm: EntityManager | undefined;
    await w.read('locked', w.input(1), (em) => {
      lockedEm = em;
      return Promise.resolve(undefined);
    });
    await w.read('none', w.input(1));

    // [locked, none]: chỉ locked bị chặn
    expect(seen).toEqual({
      leave: [ER_LOCK_NOWAIT, null],
      pending: [ER_LOCK_NOWAIT, null],
    });
    const [leaveCall] = w.leave.findBlockingLeaveCall.calls;
    expect(leaveCall?.[0]).toBe(lockedEm);
    expect(leaveCall?.[1]).toEqual({
      bacSiId: w.doctorId,
      ngay: '2026-11-10',
      ca: 'CaSang',
    });
    const [pendingCall] = w.pending.findBlockingCall.calls;
    expect(pendingCall?.[0]).toBe(lockedEm);
    expect(pendingCall?.[1]).toEqual({
      chiNhanhId: w.doctor.profile.chiNhanhId,
      ngayGio: new Date('2026-11-10T08:30:00+07:00'),
      thoiLuongPhut: 30,
      dichVuKhamId: w.doctor.profile.dichVuKhamId,
    });
  });

  it.each(['none', 'locked'] as const)(
    'chế độ %s: cổng nghỉ phép chặn (ChoDuyet và DaDuyet) ⇒ BAC_SI_NGHI_PHEP; cổng đổi chi nhánh chặn ⇒ KHUNG_GIO_NGOAI_LICH_MOI; cho qua ⇒ đạt',
    async (mode) => {
      const w = await world();
      expect(verdictOf(await w.read(mode, w.input(0)))).toBe('ok');
      for (const trangThai of ['ChoDuyet', 'DaDuyet'] as const) {
        w.leave.blocks({}, trangThai);
        expect(verdictOf(await w.read(mode, w.input(0)))).toBe(
          CODES.DOCTOR_ON_LEAVE,
        );
      }
      w.leave.allows();
      w.pending.blocks();
      expect(verdictOf(await w.read(mode, w.input(0)))).toBe(
        CODES.SLOT_OUTSIDE_NEW_SCHEDULE,
      );
      w.pending.allows();
      // cổng chỉ chặn đúng ca khác: không ảnh hưởng
      w.leave.blocks({ ca: 'CaChieu' });
      expect(verdictOf(await w.read(mode, w.input(0)))).toBe('ok');
    },
  );
});

describe('BKR-07 readNoShowLock (A4, PLAN 5.3 tầng 2)', () => {
  it('đọc cờ bật, tắt và không có hàng benh_nhan (null)', async () => {
    const w = await world();
    const noShow = (taiKhoanId: string, mode: BookabilityMode) =>
      db.transaction('READ COMMITTED', (em) =>
        w.reader.readNoShowLock(em, taiKhoanId, mode),
      );
    for (const mode of ['none', 'locked'] as const)
      expect(await noShow(w.patientId, mode)).toBe(false);
    await db.query(
      'UPDATE benh_nhan SET khoa_dat_lich_do_no_show = 1 WHERE tai_khoan_id = ?',
      [w.patientId],
    );
    for (const mode of ['none', 'locked'] as const) {
      expect(await noShow(w.patientId, mode)).toBe(true);
      expect(await noShow('999999999', mode)).toBeNull();
    }
  });

  it('chỉ chế độ locked giữ khoá benh_nhan (FOR UPDATE)', async () => {
    const w = await world();
    const sql =
      'SELECT tai_khoan_id FROM benh_nhan WHERE tai_khoan_id = ? FOR UPDATE NOWAIT';
    const locked = await db.transaction('READ COMMITTED', async (em) => {
      await w.reader.readNoShowLock(em, w.patientId, 'locked');
      return nowaitErrno(sql, [w.patientId]);
    });
    const none = await db.transaction('READ COMMITTED', async (em) => {
      await w.reader.readNoShowLock(em, w.patientId, 'none');
      return nowaitErrno(sql, [w.patientId]);
    });
    expect([locked, none]).toEqual([ER_LOCK_NOWAIT, null]);
  });
});

describe('BKR-08 nối module (PLAN 5.1, AR-03)', () => {
  it('AppointmentsModule cung cấp BookabilityReader (imports: SchedulingModule, hai cổng Noop mặc định) và tiêm được', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppointmentsModule],
    })
      .useMocker((token) => (token === DataSource ? db : undefined))
      .compile();
    const reader = moduleRef.get(BookabilityReader);
    expect(reader).toBeInstanceOf(BookabilityReader);
    // dùng thật: khung giờ không tồn tại ⇒ SlotNotFound, qua cổng Noop và BranchHoursReader thật
    const result = await reader.read(
      db.manager,
      {
        khungGioId: '999999999',
        benhNhanId: '1',
        hoSoNguoiThanId: null,
        noShowLocked: false,
        soLichHenToiDa: 3,
        now: NOW,
      },
      'none',
    );
    expect(result).toEqual({ kind: 'SlotNotFound' });
    await moduleRef.close();
  });
});

describe('BKR-09 lịch chủ hết hạn của CHÍNH khung giờ không tính; lịch ChoThanhToan hết hạn của khung giờ KHÁC vẫn tính (Q4, Q12, câu (i))', () => {
  // Hồ sơ bản thân có hai lịch ChoThanhToan ĐÃ HẾT HẠN (hạn 08:15, now 09:00): H giữ ô 3 (09:30) và O giữ ô 0 (08:00). Đặt ô 3: H là lịch chủ của chính khung giờ này.
  it.each(['none', 'locked'] as const)('chế độ %s', async (mode) => {
    const w = await world();
    const holder = await w.appt('ChoThanhToan', 3);
    const other = await w.appt('ChoThanhToan', 0);
    const candidate = (soLichHenToiDa: number) =>
      w.read(mode, w.input(3, { soLichHenToiDa }));

    // số lịch: H không tính, O tính ⇒ đếm 1
    expect(evaluateBookability(factsOf(await candidate(2)))).toEqual({
      ok: true,
      lapsedHold: { lichHenId: holder.lichHenId, maLichHen: holder.maLichHen },
    });
    expect(verdictOf(await candidate(1))).toBe(CODES.OVER_MAX_APPOINTMENTS);

    // chồng lấn: dịch vụ 150 phút ⇒ O (08:00–10:30) chồng ô 3 (09:30), H cũng chồng nhưng là lịch chủ nên bị bỏ qua
    await db.query(
      'UPDATE dich_vu_kham SET thoi_luong = 150 WHERE dich_vu_kham_id = ?',
      [w.doctor.profile.dichVuKhamId],
    );
    expect(evaluateBookability(factsOf(await candidate(3)))).toMatchObject({
      ok: false,
      code: CODES.OVERLAPPING_APPOINTMENT,
      chiTiet: { maLichHen: other.maLichHen },
    });

    // bỏ O đi thì chỉ còn H (lịch chủ) chồng ⇒ đạt
    await db.query('UPDATE lich_hen SET trang_thai = ? WHERE lich_hen_id = ?', [
      'DaHuy',
      other.lichHenId,
    ]);
    expect(verdictOf(await candidate(3))).toBe('ok');
  });
});

describe('BKR-10 chế độ locked đọc trạng thái khung giờ DƯỚI khoá, không dùng bản đọc trước khoá (H1, PLAN 5.4 bước 3)', () => {
  /**
   * Đọc ở chế độ `locked`, nhưng ngay SAU câu đọc thường đầu tiên (LOCATE) và TRƯỚC câu khoá `bac_si` thì chạy `interleaved` qua `DataSource` (KẾT NỐI KHÁC, tự commit): mô phỏng
   * người khác đổi khung giờ trong lúc ta chưa xin khoá. Báo lỗi nếu `interleaved` không chạy đúng một lần (bọc `em.query` hỏng thì test không chứng minh gì).
   */
  async function readWithInterleaved(
    w: World,
    interleaved: () => Promise<unknown>,
  ): Promise<BookabilityRead> {
    let fired = 0;
    const result = await db.transaction('READ COMMITTED', async (em) => {
      interceptQuery(em, async (sql, run) => {
        const rows = await run();
        if (LOCATE_STATEMENT.test(sql)) {
          fired += 1;
          await interleaved();
        }
        return rows;
      });
      return w.reader.read(em, w.input(0), 'locked');
    });
    expect(fired).toBe(1);
    return result;
  }

  it('khung giờ đổi ConTrong ⇒ DaDat giữa câu đọc thường và câu khoá: facts.slot và locked đều là DaDat, ra KHUNG_GIO_DA_DAT', async () => {
    const w = await world();
    const result = await readWithInterleaved(w, () =>
      db.query(
        "UPDATE khung_gio SET trang_thai = 'DaDat' WHERE khung_gio_id = ?",
        [w.slotIds[0]],
      ),
    );
    if (result.kind !== 'Read') throw new Error('khung giờ phải đọc được');
    expect(result.facts.slot.trangThai).toBe('DaDat');
    expect(result.locked?.trangThai).toBe('DaDat');
    expect(evaluateBookability(result.facts)).toMatchObject({
      ok: false,
      code: CODES.SLOT_BOOKED,
    });
  });

  it('khung giờ (không có lịch hẹn) bị xoá giữa câu đọc thường và câu khoá ⇒ SlotNotFound', async () => {
    const w = await world();
    const result = await readWithInterleaved(w, () =>
      db.query('DELETE FROM khung_gio WHERE khung_gio_id = ?', [w.slotIds[0]]),
    );
    expect(result).toEqual({ kind: 'SlotNotFound' });
  });
});
