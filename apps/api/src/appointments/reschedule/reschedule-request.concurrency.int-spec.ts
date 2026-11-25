import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import {
  createGate,
  runRounds,
  tallyOutcomes,
} from '../testing/concurrency-harness.js';
import {
  reportRounds,
  sleep,
  winnerTally,
} from '../testing/concurrency-report.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import { createRealCreateService } from '../testing/notification-world.js';
import {
  requestRows,
  requestWorld,
  resetRequestRound,
  setSelfRescheduleCount,
  writeCounts,
} from '../testing/reschedule-request-world.js';
import type { CreateRescheduleRequestOutcome } from './reschedule-request.types.js';

// reschedule B5 — TDL-16 (smoke, PLAN reschedule 7.5), XDL-27 và XDL-28 `[đề xuất]` phần C trên MySQL 8.4 THẬT, nhiều kết nối thật: `RescheduleRequestService.create` đua với chính nó và với `create` của người khác.
// CHẠY MỘT MÌNH (lane nặng, số đo ghi ở TRACKING). Mỗi vòng dùng lại MỘT thế giới và dọn dữ liệu của vòng trước (`resetRequestRound`). `reportRounds` khẳng định 0 lần thử lại 1213/1205 và 0 lần hết lượt (503):
// thứ tự khoá đúng (khung giờ mong muốn TRƯỚC `lich_hen`, X1 M2) thì các cặp này không có chu trình. TDL-16 là smoke của X2; X2 chạy bản đầy đủ khi B6, B7, B9 có mã.
const CODES = BOOKING_ERROR_CODES;
const ROUNDS = 10;
const PARALLEL_REQUESTS = 10;

let db: DataSource;
let fx: BookingFixtures;
let logs: string[];
useIntegrationHooks((d, captured) => {
  db = d;
  fx = new BookingFixtures(d);
  logs = captured;
});

/** Kết quả một bên của vòng XDL-28: bên yêu cầu mang kết quả có kiểu, bên đặt lịch chỉ báo xong (lỗi nghiệp vụ có mã đã được chấp nhận). */
type Racer =
  | { who: 'yeu-cau'; outcome: CreateRescheduleRequestOutcome }
  | { who: 'dat-lich'; outcome: null };

const ruleCode = (outcome: CreateRescheduleRequestOutcome): string =>
  outcome.kind === 'Rejected' && outcome.failure.kind === 'Rule'
    ? outcome.failure.code
    : outcome.kind;

describe('TDL-16 (smoke) mười yêu cầu cùng lúc cho MỘT lịch', () => {
  it(`${String(ROUNDS)} vòng × ${String(PARALLEL_REQUESTS)} yêu cầu: đúng MỘT ChoDuyet, chín DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET, một thông báo; 0 lần thử lại, 0 lần 503`, async () => {
    const w = await requestWorld(db, fx);
    const winners = winnerTally();
    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        await resetRequestRound(db, [w.old.lichHenId], []);
        return createGate(PARALLEL_REQUESTS);
      },
      race: (gate) =>
        Array.from({ length: PARALLEL_REQUESTS }, () => async () => {
          await gate.arrive();
          return w.request();
        }),
      check: async (_gate, results) => {
        const tally = tallyOutcomes(results);
        expect(tally.other, 'lỗi lạ').toStrictEqual([]);
        expect(tally.deadlocks + tally.lockTimeouts).toBe(0);
        const outcomes = results.map((r) =>
          r.status === 'fulfilled' ? ruleCode(r.value) : 'LOI',
        );
        expect(outcomes.filter((o) => o === 'RequestCreated')).toHaveLength(1);
        expect(
          outcomes.filter((o) => o === CODES.RESCHEDULE_REQUEST_PENDING),
        ).toHaveLength(PARALLEL_REQUESTS - 1);
        const rows = await requestRows(db);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.trangThai).toBe('ChoDuyet');
        expect(await writeCounts(db)).toStrictEqual({
          yeuCau: 1,
          thongBao: 1,
          email: 1,
        });
        await assertBookingInvariants(db);
        winners.add('một ChoDuyet');
      },
    });
    reportRounds(
      'TDL-16',
      'mười yêu cầu cùng một lịch',
      ROUNDS,
      winners.winners,
      logs,
    );
  }, 120_000);
});

describe('XDL-27 hai Bệnh nhân gửi yêu cầu cùng khung giờ mong muốn', () => {
  it(`${String(ROUNDS)} vòng: CẢ HAI tạo được (khung giờ mong muốn không bị giữ, Q7 (f)), khung giờ vẫn ConTrong; 0 lần thử lại`, async () => {
    const w = await requestWorld(db, fx);
    const [second] = await fx.patients(1);
    const secondId = second!.account.taiKhoanId;
    const secondOld = await fx.appointmentIn('DaXacNhan', {
      doctor: w.doctor,
      khungGioId: w.slotIds[1]!,
      patientId: secondId,
    });
    await setSelfRescheduleCount(db, secondOld.lichHenId, 2);
    const keep = [w.old.lichHenId, secondOld.lichHenId];
    const winners = winnerTally();
    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        await resetRequestRound(db, keep, []);
        return createGate(2);
      },
      race: (gate) => [
        async () => {
          await gate.arrive();
          return w.request();
        },
        async () => {
          await gate.arrive();
          return w.request({
            maLichHen: secondOld.maLichHen,
            accountId: secondId,
          });
        },
      ],
      check: async (_gate, results) => {
        const outcomes = results.map((r) =>
          r.status === 'fulfilled' ? r.value.kind : 'LOI',
        );
        expect(outcomes).toStrictEqual(['RequestCreated', 'RequestCreated']);
        expect(await requestRows(db)).toHaveLength(2);
        const [slot] = await db.query<{ trang_thai: string }[]>(
          'SELECT trang_thai FROM khung_gio WHERE khung_gio_id = ?',
          [w.target],
        );
        expect(slot?.trang_thai).toBe('ConTrong');
        await assertBookingInvariants(db);
        winners.add('cả hai tạo được');
      },
    });
    reportRounds(
      'XDL-27',
      'hai Bệnh nhân, cùng khung giờ',
      ROUNDS,
      winners.winners,
      logs,
    );
  }, 120_000);
});

describe('XDL-28 tạo yêu cầu đua với người khác đặt đúng khung giờ mong muốn', () => {
  it(`${String(ROUNDS)} vòng: hoặc yêu cầu được tạo (rồi người kia vẫn đặt được) hoặc KHUNG_GIO_DA_DAT; không lỗi lạ, không 1213, INV xanh`, async () => {
    const w = await requestWorld(db, fx);
    const [other] = await fx.patients(1);
    const otherId = other!.account.taiKhoanId;
    const creator = createRealCreateService(db);
    const winners = winnerTally();
    await runRounds({
      rounds: ROUNDS,
      setup: async (round) => {
        await resetRequestRound(db, [w.old.lichHenId], [w.target]);
        return { gate: createGate(2), requestFirst: round % 2 === 0 };
      },
      race: ({ gate, requestFirst }): (() => Promise<Racer>)[] => [
        async () => {
          await gate.arrive();
          if (!requestFirst) await sleep(4);
          return { who: 'yeu-cau' as const, outcome: await w.request() };
        },
        async () => {
          await gate.arrive();
          if (requestFirst) await sleep(4);
          await creator
            .create(otherId, {
              khungGioId: w.target,
              hoSoNguoiThanId: null,
              lyDoKham: null,
            })
            .catch((error: unknown) => {
              // Người đặt chậm chân gặp khung giờ đã bị chiếm: lỗi nghiệp vụ có mã, không phải lỗi lạ
              if (!(error instanceof Error) || !('maLoi' in error)) throw error;
            });
          return { who: 'dat-lich' as const, outcome: null };
        },
      ],
      check: async (_ctx, results) => {
        const tally = tallyOutcomes(results);
        expect(tally.other, 'lỗi lạ').toStrictEqual([]);
        expect(tally.deadlocks + tally.lockTimeouts).toBe(0);
        const request = results.find(
          (r) => r.status === 'fulfilled' && r.value.who === 'yeu-cau',
        );
        const outcome =
          request?.status === 'fulfilled' ? request.value.outcome : null;
        expect(outcome).not.toBeNull();
        if (outcome?.kind === 'RequestCreated') {
          winners.add('yêu cầu tạo được');
          expect(await requestRows(db)).toHaveLength(1);
        } else {
          winners.add('KHUNG_GIO_DA_DAT');
          expect(ruleCode(outcome!)).toBe(CODES.SLOT_BOOKED);
          expect(await requestRows(db)).toHaveLength(0);
        }
        await assertBookingInvariants(db);
      },
    });
    reportRounds(
      'XDL-28',
      'yêu cầu × đặt lịch cùng khung giờ',
      ROUNDS,
      winners.winners,
      logs,
    );
  }, 180_000);
});
