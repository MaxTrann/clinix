import type { DataSource, QueryRunner } from 'typeorm';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { deferred } from '../../auth/testing/verification-int-helpers.js';
import {
  isDeadlockError,
  isLockWaitTimeoutError,
} from '../../database/mysql-errors.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { DEPOSIT } from '../testing/cancel-world.js';
import { createGate, runRounds } from '../testing/concurrency-harness.js';
import { sleep, winnerTally } from '../testing/concurrency-report.js';
import { waitUntilWaiting } from '../testing/lock-wait.js';
import {
  RaceStats,
  finishX2,
  settleRound,
  sideOf,
  type Side,
} from '../testing/reschedule-race-checks.js';
import {
  closeRaceModules,
  raceWorld,
} from '../testing/reschedule-race-world.js';
import { DEFAULT_REASON } from '../testing/reschedule-request-world.js';
import { interceptStatements } from '../testing/statement-recorder.js';
import type { CreateRescheduleRequestOutcome } from './reschedule-request.types.js';

// reschedule X2 — TDL-18: ĐỐI CHỨNG R2 (PLAN reschedule 5.4 quy tắc 3, 7.5; X1 M2; TRACKING reschedule 1.17). `INSERT` yêu cầu (khoá ngoại tới `khung_gio` mong muốn và `lich_hen`) xin khoá S ngầm trên HAI hàng cha, nên hai hàng đó phải đã được
// giữ theo đúng chiều bảng khoá 5.4 (khung giờ TRƯỚC `lich_hen`). Hai nhánh, mỗi nhánh 100 vòng, hai kết nối MySQL thật, thứ tự giữa hai bên do CỔNG định (không phụ thuộc thời gian):
//  - ĐẢO (SQL thô): bên X khoá `lich_hen` rồi `INSERT` yêu cầu; bên Y khoá `khung_gio` rồi `lich_hen`: chu trình ⇒ phải có đúng một 1213 mỗi vòng (chứng minh hợp đồng khoá CẦN thiết; X1 M2: 100/100 vòng);
//  - ĐÚNG THỨ TỰ: bên X là `RescheduleRequestService.create` THẬT (benh_nhan, bac_si, khung_gio, lich_hen, rồi INSERT), bên Y như cũ; xen kẽ ai giữ `khung_gio` trước (vòng lẻ đối tác, vòng chẵn dịch vụ): 0 lần 1213 và 1205.
// INV-1…INV-10 và IVT-01…IVT-07 chạy SAU MỖI VÒNG. CHẠY MỘT MÌNH.
const TIMEOUT = 540_000;
const ROUNDS = 100;
const COC = DEPOSIT;

let db: DataSource;
let fx: BookingFixtures;
let logs: string[] = [];
useIntegrationHooks((d, captured) => {
  db = d;
  fx = new BookingFixtures(d);
  logs = captured;
});
afterEach(closeRaceModules);

const LOCK_LICH =
  'SELECT lich_hen_id FROM lich_hen WHERE lich_hen_id = ? FOR UPDATE';
const LOCK_SLOT =
  'SELECT khung_gio_id FROM khung_gio WHERE khung_gio_id = ? FOR UPDATE';
const INSERT_REQUEST = `INSERT INTO yeu_cau_doi_lich_ngoai_chinh_sach (lich_hen_id, khung_gio_mong_muon_id, ly_do_yeu_cau, trang_thai, thoi_diem_tao)
  VALUES (?, ?, ?, 'ChoDuyet', '2026-11-01 09:00:00')`;
// Câu khoá khung giờ của `lockSlot` (và của đối tác thô ở trên): MỘT bảng, khoá chính, `FOR UPDATE`
const SLOT_LOCK_SQL = /FROM khung_gio WHERE khung_gio_id = \?\s+FOR UPDATE/;

type RawResult = 'ok' | '1213' | '1205';

/** Một giao dịch `READ COMMITTED` thô (như `withBookingTransaction`, nhưng KHÔNG thử lại): trả `ok`, `1213` hay `1205`; lỗi khác ném. */
async function runRaw(
  source: DataSource,
  work: (runner: QueryRunner) => Promise<void>,
): Promise<RawResult> {
  const runner = source.createQueryRunner();
  await runner.connect();
  await runner.startTransaction('READ COMMITTED');
  try {
    await work(runner);
    await runner.commitTransaction();
    return 'ok';
  } catch (error) {
    await runner.rollbackTransaction().catch(() => undefined);
    if (isDeadlockError(error)) return '1213';
    if (isLockWaitTimeoutError(error)) return '1205';
    throw error;
  } finally {
    await runner.release();
  }
}

/** Chờ mà không treo mãi: không ai tới trong 10 giây thì ném lỗi nêu tên chỗ chờ. */
async function within(wait: Promise<unknown>, what: string): Promise<void> {
  await Promise.race([
    wait,
    sleep(10_000).then(() => {
      throw new Error(`không ai tới: ${what}`);
    }),
  ]);
}

const createdSide = (outcome: CreateRescheduleRequestOutcome): Side => ({
  ok: outcome.kind === 'RequestCreated',
  code: outcome.kind === 'RequestCreated' ? 'OK' : outcome.kind,
});

describe('TDL-18 đối chứng R2: thứ tự khoá của tạo yêu cầu', () => {
  it(
    `ĐẢO (SQL thô: lich_hen rồi INSERT yêu cầu × khung_gio rồi lich_hen), ${String(ROUNDS)} vòng: ĐÚNG MỘT 1213 mỗi vòng (chu trình, chứng minh hợp đồng khoá cần); bên còn lại xong; 0 lần 1205`,
    async () => {
      const w = await raceWorld(db, fx);
      const stats = new RaceStats();
      const tally = winnerTally();
      await runRounds<LichHen, RawResult>({
        rounds: ROUNDS,
        setup: async () => {
          await w.resetRound();
          return w.book(0, { coc: COC, soLan: 2 });
        },
        race: (a) => {
          const gate = createGate(2);
          const target = w.slot(2);
          return [
            // Bên ĐẢO: khoá lịch TRƯỚC, rồi INSERT yêu cầu (xin S ngầm ở khung giờ mong muốn)
            () =>
              runRaw(db, async (runner) => {
                await runner.query(LOCK_LICH, [a.lichHenId]);
                await within(gate.arrive(), 'bên đảo đã khoá lich_hen');
                await runner.query(INSERT_REQUEST, [
                  a.lichHenId,
                  target,
                  DEFAULT_REASON,
                ]);
              }),
            // Bên ĐÚNG thứ tự (như mọi luồng của booking): khung giờ TRƯỚC, rồi lịch
            () =>
              runRaw(db, async (runner) => {
                await runner.query(LOCK_SLOT, [target]);
                await within(
                  gate.arrive(),
                  'bên đúng thứ tự đã khoá khung_gio',
                );
                await runner.query(LOCK_LICH, [a.lichHenId]);
              }),
          ];
        },
        check: async (_a, results) => {
          const outcomes = results.map((result) => {
            if (result.status === 'rejected') throw result.reason;
            return result.value;
          });
          expect(outcomes.filter((o) => o === '1213')).toHaveLength(1);
          expect(outcomes.filter((o) => o === '1205')).toHaveLength(0);
          expect(outcomes.filter((o) => o === 'ok')).toHaveLength(1);
          stats.surfaced1213 += 1;
          tally.add(
            outcomes[0] === '1213'
              ? 'bên đảo là nạn nhân'
              : 'bên đúng thứ tự là nạn nhân',
          );
          await settleRound(db, stats, { requireDepositCovered: true });
        },
      });
      finishX2(
        'TDL-18-dao',
        'đảo thứ tự khoá (đối chứng R2)',
        ROUNDS,
        tally.winners,
        logs,
        stats,
        { surfacedAllowed: true },
      );
      expect(stats.surfaced1213, 'số vòng có 1213').toBe(ROUNDS);
    },
    TIMEOUT,
  );

  it(
    `ĐÚNG THỨ TỰ (RescheduleRequestService.create THẬT × khung_gio rồi lich_hen), ${String(ROUNDS)} vòng xen kẽ ai giữ khung_gio trước, ép chồng bằng cổng: 0 lần 1213 và 1205; dịch vụ luôn tạo được yêu cầu; đúng MỘT ChoDuyet`,
    async () => {
      const w = await raceWorld(db, fx);
      const stats = new RaceStats();
      const tally = winnerTally();
      // Vòng chẵn: dừng dịch vụ NGAY SAU câu khoá `khung_gio` của nó (chỉ lần khớp đầu tiên sau khi đặt `pause`)
      let pause: {
        reached: ReturnType<typeof deferred>;
        open: ReturnType<typeof deferred>;
      } | null = null;
      interceptStatements(db, async (call, run) => {
        const result = await run();
        const gate = pause;
        if (gate !== null && SLOT_LOCK_SQL.test(call.sql)) {
          pause = null;
          gate.reached.resolve();
          await gate.open.promise;
        }
        return result;
      });
      await runRounds<
        { a: LichHen; serviceFirst: boolean },
        { side: Side; raw: RawResult }
      >({
        rounds: ROUNDS,
        setup: async (round) => {
          await w.resetRound();
          return {
            a: await w.book(0, { coc: COC, soLan: 2 }),
            serviceFirst: round % 2 === 0,
          };
        },
        race: ({ a, serviceFirst }) => [
          async () => {
            const target = w.slot(2);
            const request = () =>
              sideOf(
                stats,
                w.request.create({
                  maLichHen: a.maLichHen,
                  khungGioMongMuonId: target,
                  lyDoYeuCau: DEFAULT_REASON,
                  accountId: w.self.accountId,
                }),
                createdSide,
              );
            const holding = deferred();
            const proceed = deferred();
            // Đối tác Y: khoá `khung_gio`, báo "đã giữ", chờ phép, rồi khoá `lich_hen`
            const partner = () =>
              runRaw(db, async (runner) => {
                await runner.query(LOCK_SLOT, [target]);
                holding.resolve();
                await proceed.promise;
                await runner.query(LOCK_LICH, [a.lichHenId]);
              });
            if (serviceFirst) {
              // Dịch vụ giữ khung giờ TRƯỚC (dừng sau câu khoá); đối tác bị chặn ở khung_gio; thả dịch vụ
              const stopped = {
                reached: deferred(),
                open: deferred(),
              };
              pause = stopped;
              const side = request();
              try {
                await within(stopped.reached.promise, 'dịch vụ giữ khung_gio');
                const raw = partner();
                await waitUntilWaiting(db, 'khung_gio', 1);
                proceed.resolve();
                stopped.open.resolve();
                return { side: await side, raw: await raw };
              } finally {
                proceed.resolve();
                stopped.open.resolve();
              }
            }
            // Đối tác giữ khung giờ TRƯỚC; dịch vụ bắt đầu sau và bị chặn ở khung_gio; thả đối tác
            const raw = partner();
            try {
              await within(holding.promise, 'đối tác giữ khung_gio');
              const side = request();
              await waitUntilWaiting(db, 'khung_gio', 1);
              proceed.resolve();
              return { side: await side, raw: await raw };
            } finally {
              proceed.resolve();
            }
          },
        ],
        check: async ({ serviceFirst }, results) => {
          const settled = results[0];
          if (settled?.status !== 'fulfilled') throw settled?.reason;
          const { side, raw } = settled.value;
          expect(side, 'dịch vụ tạo yêu cầu').toEqual({ ok: true, code: 'OK' });
          expect(raw, 'đối tác').toBe('ok');
          expect(
            await w.countRows(
              'yeu_cau_doi_lich_ngoai_chinh_sach',
              "trang_thai = 'ChoDuyet'",
            ),
          ).toBe(1);
          tally.add(
            serviceFirst
              ? 'dịch vụ giữ khung_gio trước'
              : 'đối tác giữ khung_gio trước',
          );
          await settleRound(db, stats, { requireDepositCovered: true });
        },
      });
      finishX2(
        'TDL-18-dung',
        'đúng thứ tự khoá (R2)',
        ROUNDS,
        tally.winners,
        logs,
        stats,
      );
    },
    TIMEOUT,
  );
});
