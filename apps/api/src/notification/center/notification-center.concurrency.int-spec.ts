import { performance } from 'node:perf_hooks';
import { BOOKING_NOTIFICATION_EVENTS } from '../../appointments/appointments.constants.js';
import { withBookingTransaction } from '../../appointments/locking/booking-transaction.js';
import { BookingNotifier } from '../../appointments/notifications/booking-notifier.js';
import { lockAppointment } from '../../appointments/state/cancel-appointment.query.js';
import {
  createGate,
  runRounds,
  tallyOutcomes,
  type Tally,
} from '../../appointments/testing/concurrency-harness.js';
import {
  retryStats,
  valuesOf,
} from '../../appointments/testing/concurrency-report.js';
import {
  db,
  logs,
  racePair,
  useStatusWorldHooks,
  world,
} from '../../appointments/testing/status-int-kit.js';
import { TopupNotifier } from '../../payment/topup/topup-notifier.js';
import { assertNotificationInvariants } from '../testing/notification-invariants.js';
import { NotificationCenterRepository } from './notification-center.repository.js';
import {
  NotificationCenterService,
  READ_ALL_BATCH_SIZE,
} from './notification-center.service.js';

// notification X2 — ca ĐỒNG THỜI của Trung tâm thông báo trên MySQL 8.4 thật (PLAN notification 7 "Đồng thời", R3; chạy MỘT mình): CTB-02 (đánh dấu tất cả đua giao dịch booking ghi thông báo cùng tài khoản),
// CTB-03 (hai lần đánh dấu một), CTB-04 (hai lần đánh dấu tất cả), CTB-05 (đánh dấu một, tất cả, ghi của booking và ví xen nhau). Sau MỖI vòng: IVN-01…IVN-05 (`notification-invariants.ts`).
// Mỗi ca ĐẾM 1213, 1205 (lỗi sót ra ngoài và lần thử lại của `withBookingTransaction`) và 503; số đo in ra log với tiền tố `[X2-CTB-0n]` để ghi vào TRACKING.
// DỰ ĐOÁN (ghi TRƯỚC khi đo, theo R3 và số đo M5 của X1): mỗi lô đánh dấu là một giao dịch READ COMMITTED riêng nên không giữ khoá khoảng ⇒ 0 lần 1213 và 1205 ở mọi ca, không 503.
useStatusWorldHooks();

const repository = new NotificationCenterRepository();
const centerOf = () => new NotificationCenterService(db, repository);
const unreadOf = async (taiKhoanId: string) =>
  (await centerOf().unreadCount(taiKhoanId)).soChuaDoc;
const invariants = () => assertNotificationInvariants(db, unreadOf);
/** Mốc của thông báo dựng sẵn (giờ Việt Nam như đã lưu) */
const SEEDED_AT = '2026-11-02 07:00:00';

/** Ghi `count` thông báo CHƯA đọc cho `taiKhoanId` bằng câu nhiều dòng (dữ liệu dựng, không đi qua notifier). */
async function seedUnread(taiKhoanId: string, count: number): Promise<void> {
  for (let start = 0; start < count; start += 500) {
    const size = Math.min(500, count - start);
    const values = Array.from({ length: size }, () => '(?, ?, ?, 0, ?)').join(
      ', ',
    );
    const params = Array.from({ length: size }, (_, i) => [
      taiKhoanId,
      `Thông báo dựng sẵn số ${String(start + i + 1)}.`,
      'NapViThanhCong',
      SEEDED_AT,
    ]).flat();
    await db.query(
      `INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, trang_thai_doc, thoi_diem_tao) VALUES ${values}`,
      params,
    );
  }
}

const resetUnread = (taiKhoanId: string) =>
  db.query('UPDATE thong_bao SET trang_thai_doc = 0 WHERE tai_khoan_id = ?', [
    taiKhoanId,
  ]);

/**
 * "Giao dịch booking" ghi thông báo: như mọi lõi đổi trạng thái của booking, khoá `lich_hen` theo khoá chính rồi `BookingNotifier` THẬT ghi `thong_bao` (và dòng thư) bằng `em` của giao dịch
 * (`withBookingTransaction`: READ COMMITTED, thử lại 1213/1205). Trả số mili giây của RIÊNG lời gọi `notify` (thời gian chờ khoá của câu INSERT nằm trong đó).
 */
async function bookingInsert(
  lichHenId: string,
  taiKhoanId: string,
): Promise<number> {
  return withBookingTransaction(
    db,
    async (em) => {
      await lockAppointment(em, lichHenId);
      const started = performance.now();
      await new BookingNotifier().notify(em, {
        loaiSuKien: BOOKING_NOTIFICATION_EVENTS.CONFIRMED,
        lichHenId,
        taiKhoanId,
      });
      return performance.now() - started;
    },
    { label: 'x2-booking-insert' },
  );
}

/** Xoá thông báo của lịch (và dòng thư) để vòng sau ghi lại được (UNIQUE theo lịch, tài khoản, loại). */
async function clearAppointmentNotice(lichHenId: string): Promise<void> {
  await db.query(
    'DELETE e FROM email_thong_bao e JOIN thong_bao t ON t.thong_bao_id = e.thong_bao_id WHERE t.lich_hen_id = ?',
    [lichHenId],
  );
  await db.query('DELETE FROM thong_bao WHERE lich_hen_id = ?', [lichHenId]);
}

/** Cộng dồn số đếm của mọi vòng. */
function addTally(total: Tally, part: Tally): void {
  total.total += part.total;
  total.ok += part.ok;
  total.deadlocks += part.deadlocks;
  total.lockTimeouts += part.lockTimeouts;
  for (const [code, n] of Object.entries(part.byCode))
    total.byCode[code] = (total.byCode[code] ?? 0) + n;
  total.other.push(...part.other);
}
const emptyTally = (): Tally => ({
  total: 0,
  ok: 0,
  byCode: {},
  deadlocks: 0,
  lockTimeouts: 0,
  other: [],
});

/** In số đo của ca rồi khẳng định 0 lần 1213, 1205 (sót ra ngoài hay đã thử lại), 0 lần 503, 0 lỗi lạ. */
function reportAndAssert(tag: string, rounds: number, tally: Tally): void {
  const { retries, exhausted } = retryStats(logs);
  process.stderr.write(
    `[${tag}] ${String(rounds)} vòng; việc ${String(tally.total)}, xong ${String(tally.ok)}; 1213 sót ${String(tally.deadlocks)}, 1205 sót ${String(tally.lockTimeouts)}; thử lại ${JSON.stringify(retries)}; 503 ${String(exhausted)}; mã lỗi ${JSON.stringify(tally.byCode)}
`,
  );
  expect(tally.other, `${tag}: lỗi lạ`).toEqual([]);
  expect(tally.deadlocks, `${tag}: 1213`).toBe(0);
  expect(tally.lockTimeouts, `${tag}: 1205`).toBe(0);
  expect(retries, `${tag}: thử lại 1213/1205`).toEqual({});
  expect(exhausted, `${tag}: 503`).toBe(0);
  expect(tally.byCode, `${tag}: lỗi nghiệp vụ`).toEqual({});
}

describe('CTB-02 đánh dấu tất cả đua giao dịch booking ghi thông báo cho CÙNG tài khoản', () => {
  const ROUNDS = 300;
  // Hơn một lô (500) để đua với lô giữa chừng, không chỉ lô đầu
  const SEEDED = READ_ALL_BATCH_SIZE + 100;

  it(`${String(ROUNDS)} vòng: 0 lần 1213 và 1205; mỗi lời ghi thông báo chờ ≤ 100 ms; không mất thông báo mới (dòng mới tồn tại; chưa đọc nếu ghi sau lô cuối); IVN sau mỗi vòng`, async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    await seedUnread(w.patientId, SEEDED);
    const tally = emptyTally();
    const waits: number[] = [];
    let newUnread = 0;
    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        await clearAppointmentNotice(lich.lichHenId);
        await resetUnread(w.patientId);
      },
      race: (_context, round) =>
        racePair(
          round,
          () => centerOf().markAllRead(w.patientId),
          () => bookingInsert(lich.lichHenId, w.patientId),
        ),
      check: async (_context, results) => {
        const part = tallyOutcomes(results);
        addTally(tally, part);
        const [readAll, wait] = valuesOf(results) as [
          { daDanhDau: number },
          number,
        ];
        waits.push(wait);
        // Thông báo mới KHÔNG mất: đúng một dòng của lịch; nếu nó chưa đọc thì lô cuối đã chạy trước khi nó commit
        const fresh: { daDoc: number }[] = await db.query(
          'SELECT trang_thai_doc AS daDoc FROM thong_bao WHERE lich_hen_id = ?',
          [lich.lichHenId],
        );
        expect(fresh).toHaveLength(1);
        if (fresh[0]!.daDoc === 0) newUnread += 1;
        // Mọi dòng dựng sẵn đã được đánh dấu; tổng đánh dấu = dựng sẵn (+1 nếu bắt được dòng mới)
        expect(readAll.daDanhDau).toBe(
          SEEDED + (fresh[0]!.daDoc === 1 ? 1 : 0),
        );
        await invariants();
      },
    });
    const sorted = [...waits].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;
    process.stderr.write(
      `[X2-CTB-02] thời gian ghi thông báo (ms): p95 ${p95.toFixed(1)}, max ${max.toFixed(1)}; vòng dòng mới còn chưa đọc ${String(newUnread)}/${String(ROUNDS)}
`,
    );
    reportAndAssert('X2-CTB-02', ROUNDS, tally);
    expect(
      max,
      'CTB-02: có lời ghi thông báo chờ quá 100 ms',
    ).toBeLessThanOrEqual(100);
  }, 600_000);
});

describe('CTB-03 hai lần đánh dấu MỘT thông báo cùng lúc', () => {
  const ROUNDS = 50;

  it(`${String(ROUNDS)} vòng: cả hai thành công (idempotent), hàng đã đọc, soChuaDoc mỗi bên đúng (không âm); IVN sau mỗi vòng`, async () => {
    const w = await world();
    // Một dòng đích và hai dòng khác còn chưa đọc: soChuaDoc đúng phải là 2
    await seedUnread(w.patientId, 3);
    const [target] = (await db.query(
      'SELECT CAST(MIN(thong_bao_id) AS CHAR) AS id FROM thong_bao WHERE tai_khoan_id = ?',
      [w.patientId],
    )) as { id: string }[];
    const tally = emptyTally();
    await runRounds({
      rounds: ROUNDS,
      setup: () => resetUnread(w.patientId),
      race: (_context, round) =>
        racePair(
          round,
          () => centerOf().markRead(w.patientId, target!.id),
          () => centerOf().markRead(w.patientId, target!.id),
        ),
      check: async (_context, results) => {
        addTally(tally, tallyOutcomes(results));
        for (const result of valuesOf(results))
          expect(result).toEqual({ id: target!.id, daDoc: true, soChuaDoc: 2 });
        await invariants();
      },
    });
    reportAndAssert('X2-CTB-03', ROUNDS, tally);
  }, 300_000);
});

describe('CTB-04 hai lần đánh dấu tất cả cùng lúc', () => {
  const ROUNDS = 20;
  // Ba lô: hai bên tranh nhau ở nhiều lô
  const SEEDED = 2 * READ_ALL_BATCH_SIZE + 200;

  it(`${String(ROUNDS)} vòng: tổng daDanhDau của hai bên = số chưa đọc ban đầu (không hàng nào đếm hai lần); soChuaDoc cuối 0; IVN sau mỗi vòng`, async () => {
    const w = await world();
    await seedUnread(w.patientId, SEEDED);
    const tally = emptyTally();
    await runRounds({
      rounds: ROUNDS,
      setup: () => resetUnread(w.patientId),
      race: (_context, round) =>
        racePair(
          round,
          () => centerOf().markAllRead(w.patientId),
          () => centerOf().markAllRead(w.patientId),
        ),
      check: async (_context, results) => {
        addTally(tally, tallyOutcomes(results));
        const [a, b] = valuesOf(results);
        expect(a!.daDanhDau + b!.daDanhDau).toBe(SEEDED);
        expect(await unreadOf(w.patientId)).toBe(0);
        await invariants();
      },
    });
    reportAndAssert('X2-CTB-04', ROUNDS, tally);
  }, 300_000);
});

describe('CTB-05 đánh dấu một, đánh dấu tất cả xen với ghi thông báo của booking và ví', () => {
  const ROUNDS = 50;

  it(`${String(ROUNDS)} vòng × 4 việc cùng xuất phát: 0 lần 1213, 1205, 503; IVN-05 (soChuaDoc = số dòng chưa đọc) đúng sau mỗi vòng`, async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    await seedUnread(w.patientId, READ_ALL_BATCH_SIZE + 50);
    const [target] = (await db.query(
      'SELECT CAST(MIN(thong_bao_id) AS CHAR) AS id FROM thong_bao WHERE tai_khoan_id = ?',
      [w.patientId],
    )) as { id: string }[];
    const tally = emptyTally();
    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        await clearAppointmentNotice(lich.lichHenId);
        await resetUnread(w.patientId);
      },
      race: () => {
        // Bốn việc qua MỘT cổng chung: cùng xuất phát
        const gate = createGate(4);
        const jobs: (() => Promise<unknown>)[] = [
          () => centerOf().markRead(w.patientId, target!.id),
          () => centerOf().markAllRead(w.patientId),
          () => bookingInsert(lich.lichHenId, w.patientId),
          // Ví: ghi thông báo nạp ví thành công trong giao dịch READ COMMITTED của nó
          () =>
            db.transaction('READ COMMITTED', (em) =>
              new TopupNotifier().notifySucceeded(em, {
                benhNhanId: w.patientId,
                soTien: '100000.00',
                now: new Date(),
              }),
            ),
        ];
        return jobs.map((job) => async () => {
          await gate.arrive();
          return job();
        });
      },
      check: async (_context, results) => {
        addTally(tally, tallyOutcomes(results));
        await invariants();
      },
    });
    reportAndAssert('X2-CTB-05', ROUNDS, tally);
  }, 600_000);
});
