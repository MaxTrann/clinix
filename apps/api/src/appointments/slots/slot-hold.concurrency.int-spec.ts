import { performance } from 'node:perf_hooks';
import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import {
  createBookingFlow,
  FLOW_NOW,
  type BookingFlow,
  type FlowResult,
} from '../testing/booking-flow.js';
import {
  createGate,
  runRounds,
  summarize,
  tallyOutcomes,
  type Tally,
} from '../testing/concurrency-harness.js';
import { assertBookingInvariants } from '../testing/invariants.js';

// Task B6b — DT-01, DT-02, DT-13 và BKF-02 (PLAN booking 7.10; TRACKING 3.14.5) trên MySQL 8.4 THẬT: lõi đồng thời của việc giữ khung giờ, qua hàm tạo lịch rút gọn (`testing/booking-flow.ts`)
// chạy đúng chuỗi khoá của bước tạo (bac_si FOR SHARE → khung_gio FOR UPDATE → lich_hen theo khoá chính). Mỗi vòng dựng lại dữ liệu, các yêu cầu cùng xuất phát qua một cổng (`createGate`), rồi
// chạy `assertBookingInvariants` (INV-01…INV-05). Mọi yêu cầu chạy qua `withBookingTransaction` thật (READ COMMITTED, thử lại ≤ 2, timeout chờ khoá 3 giây): "0 lỗi 1213/1205 còn sót" là
// SAU thử lại. Số vòng ≥ mức PLAN đòi (DT-01 ≥ 30, DT-02 ≥ 30, DT-13 ≥ 20 Bệnh nhân và ≥ 20 vòng, BKF-02 ≥ 30).
const CODES = BOOKING_ERROR_CODES;
const LOSS_CODES = [CODES.SLOT_BOOKED, CODES.SLOT_HELD];

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const resetAll = async () => {
  await db.query('DELETE FROM lich_hen');
  await db.query(
    "UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL",
  );
};

/** Giá trị của các yêu cầu; ném nếu có yêu cầu nào lỗi (mọi lỗi nghiệp vụ là KẾT QUẢ có kiểu, không phải lỗi ném). */
const resultsOf = (settled: PromiseSettledResult<FlowResult>[]) => {
  const { values, reasons } = summarize(settled);
  if (reasons.length > 0)
    throw new Error(`yêu cầu ném lỗi: ${String(reasons[0])}`);
  return values;
};

const emptyTally = (): Tally => ({
  total: 0,
  ok: 0,
  byCode: {},
  deadlocks: 0,
  lockTimeouts: 0,
  other: [],
});
const addTally = (sum: Tally, next: Tally) => {
  sum.total += next.total;
  sum.ok += next.ok;
  sum.deadlocks += next.deadlocks;
  sum.lockTimeouts += next.lockTimeouts;
  sum.other.push(...next.other);
  for (const [code, n] of Object.entries(next.byCode))
    sum.byCode[code] = (sum.byCode[code] ?? 0) + n;
};

/** Cộng kết quả mọi vòng; MỌI yêu cầu phải xong (không ném lỗi), 0 deadlock, 0 hết giờ chờ khoá, 0 lỗi lạ SAU thử lại. Trả tổng để ca nào cần thêm kiểm thì kiểm tiếp. */
function expectNoContention(
  rounds: readonly PromiseSettledResult<FlowResult>[][],
  total: number,
): Tally {
  const sum = emptyTally();
  for (const round of rounds) addTally(sum, tallyOutcomes(round));
  expect(sum).toMatchObject({
    total,
    deadlocks: 0,
    lockTimeouts: 0,
    other: [],
  });
  return sum;
}

/** Một yêu cầu tạo lịch cho mỗi Bệnh nhân, cùng xuất phát qua MỘT cổng; `slotOf(i)` là khung giờ của người thứ i; `onDone` nhận thời gian xong (ms) của từng yêu cầu. */
function createTogether(
  flow: BookingFlow,
  patients: readonly string[],
  slotOf: (index: number) => string,
  onDone?: (ms: number) => void,
) {
  const gate = createGate(patients.length);
  return patients.map((benhNhanId, i) => async () => {
    await gate.arrive();
    const started = performance.now();
    const result = await flow.create({ khungGioId: slotOf(i), benhNhanId });
    onDone?.(performance.now() - started);
    return result;
  });
}

/** Đúng MỘT `Created`, mọi yêu cầu còn lại `Rejected` với mã trong `codes`. */
function expectOneWinner(
  values: readonly FlowResult[],
  codes: readonly string[],
) {
  const created = values.filter((v) => v.kind === 'Created');
  expect(created).toHaveLength(1);
  for (const value of values.filter((v) => v.kind !== 'Created')) {
    expect(value.kind).toBe('Rejected');
    if (value.kind === 'Rejected') expect(codes).toContain(value.code);
  }
}

async function world(extraPatients: number) {
  const w = await fx.world();
  const patients = [
    w.patient.account.taiKhoanId,
    ...(await fx.patients(extraPatients)).map((p) => p.account.taiKhoanId),
  ];
  return { ...w, patients, flow: createBookingFlow(db) };
}

describe('DT-01 hai Bệnh nhân khác nhau cùng giữ một khung giờ (≥ 30 vòng)', () => {
  it('đúng một lần tạo được; người kia KHUNG_GIO_DANG_GIU hoặc KHUNG_GIO_DA_DAT; không lỗi lạ; 0 deadlock; INV sau mỗi vòng', async () => {
    const w = await world(1);
    const slotId = w.slotIds[0]!;
    const all = await runRounds({
      rounds: 40,
      setup: resetAll,
      race: () => createTogether(w.flow, w.patients.slice(0, 2), () => slotId),
      check: async (_context, results) => {
        expectOneWinner(resultsOf(results), LOSS_CODES);
        const [{ n }] = await db.query<{ n: string | number }[]>(
          "SELECT COUNT(*) AS n FROM lich_hen WHERE khung_gio_id = ? AND trang_thai = 'ChoThanhToan'",
          [slotId],
        );
        expect(Number(n)).toBe(1);
        await assertBookingInvariants(db);
      },
    });
    expect(all).toHaveLength(40);
    expectNoContention(all, 80);
  });
});

describe('DT-02 mười yêu cầu cùng một khung giờ (≥ 30 vòng)', () => {
  it('đúng một thắng; chín bị từ chối có mã; không lỗi lạ, không 1213/1205; mỗi yêu cầu xong trong thời gian chờ hợp lý (< timeout 3 giây)', async () => {
    const w = await world(9);
    const slotId = w.slotIds[1]!;
    let slowest = 0;
    const all = await runRounds({
      rounds: 30,
      setup: resetAll,
      race: () =>
        createTogether(
          w.flow,
          w.patients,
          () => slotId,
          (ms) => {
            slowest = Math.max(slowest, ms);
          },
        ),
      check: async (_context, results) => {
        const values = resultsOf(results);
        expect(values).toHaveLength(10);
        expectOneWinner(values, LOSS_CODES);
        await assertBookingInvariants(db);
      },
    });
    expectNoContention(all, 300);
    expect(slowest).toBeLessThan(3000);
  });
});

describe('DT-13 nhiều Bệnh nhân khác nhau đặt nhiều khung giờ khác nhau của cùng một bác sĩ (≥ 20 người)', () => {
  it('20 Bệnh nhân × 20 khung giờ của 3 ca: tất cả tạo được, 0 lỗi 1213/1205 còn sót sau thử lại, INV sau mỗi vòng', async () => {
    const w = await world(19);
    const slotIds = [...w.slotIds];
    for (const ngay of ['2026-11-11', '2026-11-12']) {
      const extra = await fx.doctor.shiftWithSlots(w.doctor.profile, {
        ngay,
        ca: 'CaSang',
      });
      slotIds.push(...extra.slotIds);
    }
    expect(w.patients).toHaveLength(20);
    expect(slotIds.length).toBeGreaterThanOrEqual(20);
    const all = await runRounds({
      rounds: 20,
      setup: resetAll,
      race: () => createTogether(w.flow, w.patients, (i) => slotIds[i]!),
      check: async (_context, results) => {
        const values = resultsOf(results);
        expect(values.filter((v) => v.kind === 'Created')).toHaveLength(20);
        const [{ n }] = await db.query<{ n: string | number }[]>(
          "SELECT COUNT(*) AS n FROM lich_hen WHERE trang_thai = 'ChoThanhToan'",
        );
        expect(Number(n)).toBe(20);
        await assertBookingInvariants(db);
      },
    });
    expect(expectNoContention(all, 400).ok).toBe(400);
  });
});

describe('BKF-02 đua hết hạn lười: hai Bệnh nhân cùng khung giờ DangGiuCho đã hết hạn (≥ 30 vòng)', () => {
  it('đúng một thắng; lịch cũ DaHuy đúng MỘT lần; 0 lỗi 1213/1205 còn sót; INV', async () => {
    const w = await world(2);
    const slotId = w.slotIds[3]!;
    const [first, second, holderId] = w.patients as [string, string, string];
    let oldId = '';
    const all = await runRounds({
      rounds: 40,
      setup: async () => {
        await resetAll();
        const old = await fx.appointmentIn('ChoThanhToan', {
          doctor: w.doctor.profile,
          khungGioId: slotId,
          patientId: holderId,
          hanThanhToan: new Date(FLOW_NOW.getTime() - 60_000),
        });
        oldId = String(old.lichHenId);
      },
      race: () => createTogether(w.flow, [first, second], () => slotId),
      check: async (_context, results) => {
        const values = resultsOf(results);
        expectOneWinner(values, [CODES.SLOT_HELD]);
        const winner = values.find((v) => v.kind === 'Created');
        expect(winner).toMatchObject({ expiredHolderId: oldId });
        const rows = await db.query<
          { trangThai: string; n: string | number }[]
        >(
          'SELECT trang_thai AS trangThai, COUNT(*) AS n FROM lich_hen WHERE khung_gio_id = ? GROUP BY trang_thai',
          [slotId],
        );
        expect(
          Object.fromEntries(rows.map((r) => [r.trangThai, Number(r.n)])),
        ).toEqual({ DaHuy: 1, ChoThanhToan: 1 });
        await assertBookingInvariants(db);
      },
    });
    expectNoContention(all, 80);
  });
});
