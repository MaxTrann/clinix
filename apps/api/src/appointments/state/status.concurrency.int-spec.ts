import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import type { CancelOutcome } from '../cancel/cancel.types.js';
import { cancelInput } from '../testing/cancel-world.js';
import { createGate, runRounds } from '../testing/concurrency-harness.js';
import {
  reportRounds,
  type ReportOptions,
  valuesOf,
  winnerTally,
} from '../testing/concurrency-report.js';
import { createAppointmentWorld } from '../testing/create-appointment-world.js';
import { readAppointment } from '../testing/expiry-fixtures.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import {
  FAKE_PAYMENT_EVENT,
  notificationRows,
  resetBookingRound,
} from '../testing/payment-doctor-fakes.js';
import {
  AFTER_ALL_WINDOWS,
  checkInInput,
  createStatusStack,
  fakeCashCheckIn,
  IN_WINDOW,
  noShowInput,
  readNoShow,
  runCheckIn,
  runNoShow,
  setNoShow,
  type NoShowState,
  type StatusStack,
  type StatusWorld,
} from '../testing/status-world.js';
import {
  db,
  fx,
  logs,
  racePair,
  useStatusWorldHooks,
  world,
} from '../testing/status-int-kit.js';
import type {
  CheckInOutcome,
  MarkNoShowOutcome,
} from './appointment-transition.service.js';

// Task B12 — các ca ĐỒNG THỜI của `checkIn` và `markNoShow` trên MySQL 8.4 THẬT (PLAN booking 7.10 DT-05, DT-06, DT-15; 7.5 CT-13; 7.6 VM-09, VM-15; 7.32 CKI-08, CKI-09, NSH-09, NSH-10; TRACKING 3.26 B12-F, B12-H). Mỗi vòng dựng lại dữ liệu,
// các bên cùng xuất phát (`createGate`), vòng chẵn bên này đi trước vài mili giây, vòng lẻ bên kia (xen kẽ thứ tự xuất phát để CẢ HAI nhánh thắng đều chạy), kiểm kết quả rồi chạy `assertBookingInvariants` (INV-01…INV-05). Mọi yêu cầu qua
// `withBookingTransaction` thật (READ COMMITTED, thử lại ≤ 2, timeout chờ khoá 3 giây). Mỗi ca ĐẾM lần thử lại 1213 và 1205, GHI bên thắng mỗi vòng (dòng `[B12-DT]`) và khẳng định KHÔNG có lần thử lại nào (`reportRounds`): thứ tự khoá 5.3
// (`benh_nhan` rồi `lich_hen`, không `khung_gio`) không có deadlock nào. HAI NGOẠI LỆ CÓ CHỦ Ý: (1) CKI-08 đối chứng ÂM: HAI lần thu tiền cùng một lịch, mỗi bên ghi dòng có khoá ngoại rồi mới `checkIn`, cổng `createGate` giữ cả hai tới khi cùng giữ khoá S ⇒ deadlock 1213 xác định (B12-S: KHÔNG phải với `cancel`, nâng khoá S lên X được cấp vượt hàng đợi); (2) CT-13, DT-06 và CKI-09, nơi `markNoShow` (khoá `benh_nhan` rồi `lich_hen`) đua đổi trạng thái của CÙNG MỘT lịch: `UPDATE lich_hen SET trang_thai` của bên kia xin NGẦM khoá S trên hàng cha `benh_nhan` sau khi giữ X trên `lich_hen` (B12-Q; Đại quyết phương án (1) 12/11/2026), nên 1213 có thể xảy ra và được thử lại: các ca đó IN số lần thử lại nhưng chỉ khẳng định kết quả đúng, INV xanh, không lỗi lạ và 0 lần hết lượt (503). VM-09 (hai `markNoShow` nối đuôi ở `benh_nhan`), NSH-09, NSH-10 và DT-15 không có cạnh đó nên VẪN khẳng định 0. CHẠY MỘT MÌNH (nhạy với tải máy, như DT-01).
// DT-06 và VM-09 là "một phần (B12)": bên Vắng mặt là `markNoShow` thật gọi trực tiếp (actor `HeThong` kèm `isDue` luôn đúng), job thật là B13. Thông báo GHI THẬT dòng `thong_bao` (khoá ngoại tới `lich_hen` và `tai_khoan`).
const ROUNDS = 40;
const SLOW = 120_000;
const { CANCELLED, NO_SHOW, NO_SHOW_LOCK } = BOOKING_NOTIFICATION_EVENTS;
const TAG = 'B12-DT';

useStatusWorldHooks();
const report = (
  name: string,
  rounds: number,
  winners: Record<string, number>,
  options: ReportOptions = {},
) => {
  reportRounds(TAG, name, rounds, winners, logs, options);
};
// Cơ chế khoá ngầm đã đo (B12-Q): cho phép thử lại, vẫn khẳng định 0 lần hết lượt
const HIDDEN_FK_LOCK = { retriesAllowed: true } as const;

/** Dữ liệu dựng lại SẠCH, bộ đếm của `accountId` đặt về `counter`, rồi các lịch DaXacNhan ở các khung giờ `slots` của `patientId` */
async function fresh(
  w: StatusWorld,
  options: {
    counter?: NoShowState;
    slots?: readonly number[];
    patientId?: string;
  } = {},
) {
  await resetBookingRound(db);
  const patientId = options.patientId ?? w.patientId;
  await setNoShow(db, patientId, options.counter ?? { soLan: 0, khoa: false });
  const lich = [];
  for (const slot of options.slots ?? [0])
    lich.push(await w.booked('DaXacNhan', slot, { patientId }));
  return lich;
}

/** Kết quả nghiệp vụ của một lời gọi có thể bị từ chối bằng `AppException` (409, 403…): lỗi khác (deadlock, 1205, lỗi lạ) vẫn ném để vòng đỏ. */
const business = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ kind: 'ok' as const, value }),
    (error: unknown) => {
      if (error instanceof AppException)
        return { kind: 'refused' as const, maLoi: error.maLoi };
      throw error;
    },
  );

const eventsOf = async () =>
  (await notificationRows(db)).map((row) => row.loai).sort();

/** Vắng mặt thắng cuộc đua: kết quả `NoShowed` (số mới 1), lịch `VangMat` và bộ đếm +1, chưa khoá (DT-06, CKI-09) */
const expectNoShowWon = (
  noShow: unknown,
  row: { trangThai: string },
  counter: NoShowState,
) => {
  expect(noShow).toMatchObject({ kind: 'NoShowed', soLanNoShow: 1 });
  expect(row.trangThai).toBe('VangMat');
  expect(counter).toEqual({ soLan: 1, khoa: false });
};

/** Hai `markNoShow` của Lễ tân (cùng một bộ dịch vụ) cho hai lịch, kết quả theo thứ tự `pair`; lịch số 0 đi sau ở vòng chẵn (DT-15, NSH-09) */
const raceTwoNoShows = (
  w: StatusWorld,
  round: number,
  pair: readonly [string, string],
) => {
  const stack = createStatusStack(db);
  const run = (lichHenId: string) => () =>
    runNoShow(db, stack.transition, noShowInput(w, lichHenId, 'LeTan'));
  return racePair(round + 1, run(pair[0]), run(pair[1]));
};

type Lich = Awaited<ReturnType<typeof fresh>>[number];
/** Ngữ cảnh một vòng của ca đua trên MỘT lịch: thế giới, lịch mới dựng và MỘT bộ dịch vụ dùng chung cho cả hai bên */
interface LichRace {
  w: StatusWorld;
  lich: Lich;
  stack: StatusStack;
}

/** Bệnh nhân huỷ lịch (dịch vụ huỷ THẬT của B10): một bên của mọi ca "huỷ đua với …" */
const cancelByPatient = ({ w, lich, stack }: LichRace) =>
  stack.cancellation.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen));

/**
 * Ca đua hai bên trên MỘT lịch `DaXacNhan` mới mỗi vòng, CÙNG một bộ dịch vụ, xen kẽ ai đi trước (`racePair`): dựng, chạy `ROUNDS` vòng, `check` kiểm từng vòng (ghi bên thắng vào `tally`) rồi in số liệu `[B12-DT]`
 * (DT-05, DT-06, CKI-09). Tách ra để ba ca không lặp khung vòng đua (jscpd, TRACKING 3.26 B12-V); mọi khẳng định vẫn ở `check` của từng ca.
 */
async function raceOnOneLich(spec: {
  name: string;
  options?: ReportOptions;
  first: (c: LichRace) => Promise<unknown>;
  second: (c: LichRace) => Promise<unknown>;
  check: (
    c: LichRace,
    results: PromiseSettledResult<unknown>[],
    tally: ReturnType<typeof winnerTally>,
  ) => Promise<void>;
}) {
  const w = await world();
  const tally = winnerTally();
  await runRounds({
    rounds: ROUNDS,
    setup: async () => ({
      w,
      lich: (await fresh(w))[0]!,
      stack: createStatusStack(db),
    }),
    race: (c, round) =>
      racePair(
        round,
        () => spec.first(c),
        () => spec.second(c),
      ),
    check: (c, results) => spec.check(c, results, tally),
  });
  report(spec.name, ROUNDS, tally.winners, spec.options);
}

describe('DT-05 Bệnh nhân huỷ cùng lúc Lễ tân tiếp đón (checkIn THẬT, một bản API; ≥ 30 vòng, luân phiên bên nào đi trước)', () => {
  it(
    `${String(ROUNDS)} vòng: đúng MỘT kết quả (DaHuy + khung giờ ConTrong, hay DaTiepDon + khung giờ DaDat); bên thua nhận kết quả có kiểu; không deadlock; INV`,
    () =>
      raceOnOneLich({
        name: 'DT-05',
        first: cancelByPatient,
        second: ({ w, lich, stack }) =>
          runCheckIn(
            db,
            stack.transition,
            checkInInput(w, lich.lichHenId, 'LeTan'),
          ),
        check: async ({ w, lich }, results, tally) => {
          const [cancelled, checked] = valuesOf(results) as [
            CancelOutcome,
            CheckInOutcome,
          ];
          const row = await readAppointment(db, lich.lichHenId);
          if (cancelled.kind === 'Cancelled') {
            expect(checked).toEqual({
              kind: 'InvalidState',
              trangThai: 'DaHuy',
            });
            expect(row.trangThai).toBe('DaHuy');
            expect((await fx.slotState(w.slotId(0))).trangThai).toBe(
              'ConTrong',
            );
            tally.add('Bệnh nhân huỷ');
          } else {
            expect(cancelled).toEqual({
              kind: 'NotCancellable',
              trangThai: 'DaTiepDon',
            });
            expect(checked).toEqual({ kind: 'CheckedIn' });
            expect(row.trangThai).toBe('DaTiepDon');
            expect((await fx.slotState(w.slotId(0))).trangThai).toBe('DaDat');
            tally.add('Lễ tân tiếp đón');
          }
          await assertBookingInvariants(db);
        },
      }),
    SLOW,
  );
});

describe('DT-06 (phần B12) Bệnh nhân huỷ cùng lúc Vắng mặt (markNoShow THẬT, actor HeThong; job thật là B13) (≥ 30 vòng)', () => {
  it(
    `${String(ROUNDS)} vòng: đúng MỘT kết quả; không giải phóng sai: huỷ thắng ⇒ ConTrong, mời chờ một lần, số lần không đổi; Vắng mặt thắng ⇒ khung giờ giữ DaDat, không mời chờ, số lần +1; INV`,
    () =>
      raceOnOneLich({
        name: 'DT-06',
        options: HIDDEN_FK_LOCK,
        first: cancelByPatient,
        second: ({ w, lich, stack }) =>
          runNoShow(
            db,
            stack.transition,
            noShowInput(w, lich.lichHenId, 'HeThong'),
          ),
        check: async ({ w, lich, stack }, results, tally) => {
          const [cancelled, noShow] = valuesOf(results) as [
            CancelOutcome,
            MarkNoShowOutcome,
          ];
          const row = await readAppointment(db, lich.lichHenId);
          const counter = await readNoShow(db, w.patientId);
          if (cancelled.kind === 'Cancelled') {
            expect(noShow).toEqual({
              kind: 'InvalidState',
              trangThai: 'DaHuy',
            });
            expect(row.trangThai).toBe('DaHuy');
            expect(counter).toEqual({ soLan: 0, khoa: false });
            expect((await fx.slotState(w.slotId(0))).trangThai).toBe(
              'ConTrong',
            );
            expect(await eventsOf()).toEqual([CANCELLED]);
            // lịch đã quá giờ hẹn thì không mời; ở đây giờ hẹn còn ở tương lai (đồng hồ T0) nên mời đúng một lần
            expect(stack.ports.waitlist.onSlotReleasedCall.count).toBe(1);
            tally.add('Bệnh nhân huỷ');
          } else {
            expect(cancelled).toEqual({
              kind: 'NotCancellable',
              trangThai: 'VangMat',
            });
            expectNoShowWon(noShow, row, counter);
            expect((await fx.slotState(w.slotId(0))).trangThai).toBe('DaDat');
            expect(await eventsOf()).toEqual([NO_SHOW]);
            expect(stack.ports.waitlist.onSlotReleasedCall.count).toBe(0);
            tally.add('Vắng mặt');
          }
          await assertBookingInvariants(db);
        },
      }),
    SLOW,
  );
});

describe('CT-13 hai Lễ tân cùng đổi một lịch (một huỷ, một đánh Vắng mặt) qua dịch vụ điều phối THẬT, hai bản API (≥ 30 vòng)', () => {
  it(
    `${String(ROUNDS)} vòng: đúng MỘT thắng (DaHuy hay VangMat), bên thua nhận lỗi nghiệp vụ 409 đúng mã; số lần no-show và thông báo khớp bên thắng; INV`,
    async () => {
      const w = await world();
      const second = await fx.admin.receptionist(w.branch);
      const secondId = second.account.taiKhoanId;
      const tally = winnerTally();
      vi.setSystemTime(AFTER_ALL_WINDOWS);
      await runRounds({
        rounds: ROUNDS,
        setup: async () => {
          vi.setSystemTime(AFTER_ALL_WINDOWS);
          return { lich: (await fresh(w))[0]! };
        },
        race: ({ lich }, round) => {
          const first = createStatusStack(db);
          const other = createStatusStack(db);
          return racePair(
            round,
            () =>
              business(
                first.reception.change(w.receptionId, lich.maLichHen, {
                  trangThai: 'DaHuy',
                  lyDo: 'Bệnh nhân xin huỷ',
                }),
              ),
            () =>
              business(
                other.reception.change(secondId, lich.maLichHen, {
                  trangThai: 'VangMat',
                }),
              ),
          );
        },
        check: async ({ lich }, results) => {
          const [huy, vang] = valuesOf(results);
          const row = await readAppointment(db, lich.lichHenId);
          const counter = await readNoShow(db, w.patientId);
          if (huy?.kind === 'ok') {
            expect(vang).toEqual({
              kind: 'refused',
              maLoi: 'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
            });
            expect(row.trangThai).toBe('DaHuy');
            expect(counter).toEqual({ soLan: 0, khoa: false });
            expect(await eventsOf()).toEqual([CANCELLED]);
            tally.add('Lễ tân huỷ');
          } else {
            expect(huy).toEqual({
              kind: 'refused',
              maLoi: 'LICH_HEN_KHONG_CHO_HUY',
            });
            expect(vang?.kind).toBe('ok');
            expect(row.trangThai).toBe('VangMat');
            expect(counter).toEqual({ soLan: 1, khoa: false });
            expect(await eventsOf()).toEqual([NO_SHOW]);
            tally.add('Lễ tân Vắng mặt');
          }
          await assertBookingInvariants(db);
        },
      });
      report('CT-13', ROUNDS, tally.winners, HIDDEN_FK_LOCK);
    },
    SLOW,
  );
});

describe('VM-09 (phần B12) hai bản "job" đánh Vắng mặt CÙNG một lịch (markNoShow THẬT, actor HeThong): mỗi lịch đúng một lần, số lần no-show đúng (≥ 30 vòng)', () => {
  it(
    `${String(ROUNDS)} vòng: một NoShowed và một InvalidState (VangMat); so_lan_no_show chỉ +1; đúng một thông báo LichHenVangMat (và KhoaDatLichNoShow đúng một lần khi đạt ngưỡng)`,
    async () => {
      const w = await world();
      const tally = winnerTally();
      await runRounds({
        rounds: ROUNDS,
        // hai nửa: số lần bắt đầu 0 (không tới ngưỡng) và 2 (đạt ngưỡng 3)
        setup: async (round) => ({
          lich: (
            await fresh(w, {
              counter: { soLan: round % 2 === 0 ? 2 : 0, khoa: false },
            })
          )[0]!,
          round,
        }),
        race: ({ lich }, round) => {
          const noShow = () =>
            runNoShow(
              db,
              createStatusStack(db).transition,
              noShowInput(w, lich.lichHenId, 'HeThong'),
            );
          return racePair(round, noShow, noShow);
        },
        check: async ({ lich, round }, results) => {
          const outcomes = valuesOf(results);
          expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual([
            'InvalidState',
            'NoShowed',
          ]);
          const loser = outcomes.find((o) => o.kind === 'InvalidState');
          expect(loser).toEqual({ kind: 'InvalidState', trangThai: 'VangMat' });
          const reached = round % 2 === 0;
          expect(await readNoShow(db, w.patientId)).toEqual({
            soLan: reached ? 3 : 1,
            khoa: reached,
          });
          expect(await eventsOf()).toEqual(
            reached ? [NO_SHOW, NO_SHOW_LOCK].sort() : [NO_SHOW],
          );
          expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
            'VangMat',
          );
          tally.add(outcomes[0]?.kind === 'NoShowed' ? 'bản một' : 'bản hai');
          await assertBookingInvariants(db);
        },
      });
      report('VM-09', ROUNDS, tally.winners);
    },
    SLOW,
  );
});

describe('DT-15, VM-15 hai lịch của CÙNG một tài khoản bị đánh Vắng mặt đồng thời: so_lan_no_show đúng + 2, cờ khoá đúng (khoá benh_nhan) (≥ 30 vòng)', () => {
  it(
    `${String(ROUNDS)} vòng: cả hai NoShowed; số lần mới {2, 3}; ĐÚNG MỘT bên bật cờ (bên về sau); cờ true; đúng hai LichHenVangMat và một KhoaDatLichNoShow; INV`,
    async () => {
      const w = await world();
      const tally = winnerTally();
      await runRounds({
        rounds: ROUNDS,
        // số lần bắt đầu 1: sau hai lần là 3 = ngưỡng
        setup: async () => ({
          pair: await fresh(w, {
            counter: { soLan: 1, khoa: false },
            slots: [0, 1],
          }),
        }),
        race: ({ pair }, round) =>
          raceTwoNoShows(w, round, [pair[0]!.lichHenId, pair[1]!.lichHenId]),
        check: async ({ pair }, results) => {
          const outcomes = valuesOf(results);
          for (const outcome of outcomes) expect(outcome.kind).toBe('NoShowed');
          const counts = outcomes
            .map((outcome) =>
              outcome.kind === 'NoShowed' ? outcome.soLanNoShow : -1,
            )
            .sort((a, b) => a - b);
          expect(counts).toEqual([2, 3]);
          expect(
            outcomes.filter(
              (outcome) => outcome.kind === 'NoShowed' && outcome.khoaDatLich,
            ),
          ).toHaveLength(1);
          expect(await readNoShow(db, w.patientId)).toEqual({
            soLan: 3,
            khoa: true,
          });
          expect(await eventsOf()).toEqual(
            [NO_SHOW, NO_SHOW, NO_SHOW_LOCK].sort(),
          );
          for (const lich of pair)
            expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
              'VangMat',
            );
          const first = outcomes[0];
          tally.add(
            first?.kind === 'NoShowed' && first.soLanNoShow === 2
              ? 'lịch ô 0 vào trước'
              : 'lịch ô 1 vào trước',
          );
          await assertBookingInvariants(db);
        },
      });
      report('DT-15', ROUNDS, tally.winners);
    },
    SLOW,
  );
});

describe('NSH-09 hai lịch của HAI tài khoản khác nhau đánh Vắng mặt đồng thời: mỗi tài khoản +1, không ảnh hưởng nhau (≥ 30 vòng)', () => {
  it(
    `${String(ROUNDS)} vòng: cả hai NoShowed; mỗi tài khoản đúng +1; cờ không đổi; mỗi tài khoản đúng một thông báo của MÌNH; INV`,
    async () => {
      const w = await world();
      await runRounds({
        rounds: ROUNDS,
        setup: async () => {
          const [one] = await fresh(w, { slots: [0] });
          await setNoShow(db, w.secondPatientId, { soLan: 0, khoa: false });
          const two = await w.booked('DaXacNhan', 1, {
            patientId: w.secondPatientId,
          });
          return { pair: [one!, two] as const };
        },
        race: ({ pair }, round) =>
          raceTwoNoShows(w, round, [pair[0].lichHenId, pair[1].lichHenId]),
        check: async ({ pair }, results) => {
          for (const outcome of valuesOf(results))
            expect(outcome).toMatchObject({ kind: 'NoShowed', soLanNoShow: 1 });
          for (const id of [w.patientId, w.secondPatientId])
            expect(await readNoShow(db, id)).toEqual({ soLan: 1, khoa: false });
          expect(await notificationRows(db)).toEqual(
            expect.arrayContaining([
              {
                taiKhoanId: w.patientId,
                lichHenId: pair[0].lichHenId,
                loai: NO_SHOW,
              },
              {
                taiKhoanId: w.secondPatientId,
                lichHenId: pair[1].lichHenId,
                loai: NO_SHOW,
              },
            ]),
          );
          expect(await notificationRows(db)).toHaveLength(2);
          await assertBookingInvariants(db);
        },
      });
      report('NSH-09', ROUNDS, {});
    },
    SLOW,
  );
});

describe('CKI-09 Lễ tân tiếp đón cùng lúc job đánh Vắng mặt CÙNG một lịch (checkIn và markNoShow THẬT; VM-10 của B13 chạy lại với job thật) (≥ 30 vòng)', () => {
  it(
    `${String(ROUNDS)} vòng: đúng MỘT kết quả (DaTiepDon hay VangMat); bên thua nhận InvalidState với trạng thái của bên thắng; số lần no-show chỉ +1 khi Vắng mặt thắng; INV`,
    () =>
      raceOnOneLich({
        name: 'CKI-09',
        options: HIDDEN_FK_LOCK,
        first: ({ w, lich, stack }) =>
          runCheckIn(
            db,
            stack.transition,
            checkInInput(w, lich.lichHenId, 'LeTan'),
          ),
        second: ({ w, lich, stack }) =>
          runNoShow(
            db,
            stack.transition,
            noShowInput(w, lich.lichHenId, 'HeThong'),
          ),
        check: async ({ w, lich }, results, tally) => {
          const [checked, noShow] = valuesOf(results) as [
            CheckInOutcome,
            MarkNoShowOutcome,
          ];
          const row = await readAppointment(db, lich.lichHenId);
          const counter = await readNoShow(db, w.patientId);
          if (checked.kind === 'CheckedIn') {
            expect(noShow).toEqual({
              kind: 'InvalidState',
              trangThai: 'DaTiepDon',
            });
            expect(row.trangThai).toBe('DaTiepDon');
            expect(counter).toEqual({ soLan: 0, khoa: false });
            expect(await notificationRows(db)).toEqual([]);
            tally.add('Lễ tân tiếp đón');
          } else {
            expect(checked).toEqual({
              kind: 'InvalidState',
              trangThai: 'VangMat',
            });
            expectNoShowWon(noShow, row, counter);
            expect(await eventsOf()).toEqual([NO_SHOW]);
            tally.add('Vắng mặt');
          }
          expect((await fx.slotState(w.slotId(0))).trangThai).toBe('DaDat');
          await assertBookingInvariants(db);
        },
      }),
    SLOW,
  );
});

describe('NSH-10 Vắng mặt cùng lúc tạo lịch mới của CÙNG tài khoản (create THẬT của B8 và markNoShow THẬT; hai thứ tự xuất phát) (≥ 30 vòng)', () => {
  it(
    `${String(ROUNDS)} vòng: tạo thấy cờ khoá hay không tuỳ ai vào trước benh_nhan: tạo trước ⇒ có lịch mới; Vắng mặt trước (cờ bật) ⇒ 403 DAT_LICH_BI_KHOA_NO_SHOW và khung giờ vẫn ConTrong; luôn VangMat + cờ true; 0 deadlock; INV`,
    async () => {
      const w = await createAppointmentWorld(db, fx);
      const stack = createStatusStack(db);
      const tally = winnerTally();
      const newSlot = 4;
      await runRounds({
        rounds: ROUNDS,
        setup: async () => {
          await resetBookingRound(db);
          await setNoShow(db, w.patientId, { soLan: 2, khoa: false });
          return { lich: await w.book('DaXacNhan', 0) };
        },
        race: ({ lich }, round) =>
          racePair(
            round,
            () => business(w.create(newSlot)),
            () =>
              runNoShow(db, stack.transition, {
                lichHenId: lich.lichHenId,
                now: AFTER_ALL_WINDOWS,
                config: w.config,
                actor: 'HeThong',
                isDue: () => Promise.resolve(true),
              }),
          ),
        check: async ({ lich }, results) => {
          const [created, noShow] = valuesOf(results) as [
            Awaited<ReturnType<typeof business>>,
            MarkNoShowOutcome,
          ];
          expect(noShow).toMatchObject({
            kind: 'NoShowed',
            soLanNoShow: 3,
            khoaDatLich: true,
          });
          expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
            'VangMat',
          );
          expect(await readNoShow(db, w.patientId)).toEqual({
            soLan: 3,
            khoa: true,
          });
          const newSlotState = (await fx.slotState(w.slot(newSlot))).trangThai;
          if (created.kind === 'ok') {
            // tạo vào trước: có lịch mới, khung giờ đã đặt (cọc 0đ ⇒ DaXacNhan, khung giờ DaDat)
            expect(newSlotState).toBe('DaDat');
            tally.add('tạo vào trước');
          } else {
            expect(created).toEqual({
              kind: 'refused',
              maLoi: 'DAT_LICH_BI_KHOA_NO_SHOW',
            });
            expect(newSlotState).toBe('ConTrong');
            tally.add('Vắng mặt vào trước');
          }
          await w.expectSettled(newSlot);
        },
      });
      report('NSH-10', ROUNDS, tally.winners);
    },
    SLOW,
  );
});

describe('CKI-08 điều kiện thứ tự gọi của payment (B17): checkIn TRƯỚC mọi ghi vào bảng có khoá ngoại tới lich_hen, HOẶC sau khi chính payment đã khoá lịch theo khoá chính', () => {
  // Số dòng cảnh báo 1213 từ đầu test (mỗi lần thử lại hay hết lượt vì 1213 ghi một dòng): hiệu hai lần đọc là số 1213 của một vòng
  const deadlocksSoFar = () =>
    logs.filter((line) => /MySQL 1213/.test(line)).length;

  const race = (
    order: 'checkInFirst' | 'lockFirst',
    name: string,
    rounds: number,
  ) =>
    it(
      `ĐÚNG thứ tự (${order}): ${String(rounds)} vòng đua tự do với huỷ của Bệnh nhân, mỗi vòng đúng một bên thắng, 0 lỗi 1213 và 1205; INV`,
      async () => {
        const w = await world();
        const tally = winnerTally();
        await runRounds({
          rounds: rounds,
          setup: async () => ({
            lich: (await fresh(w))[0]!,
            stack: createStatusStack(db),
          }),
          race: ({ lich, stack }, round) =>
            racePair(
              round,
              () =>
                fakeCashCheckIn(db, stack.transition, {
                  lichHenId: lich.lichHenId,
                  taiKhoanId: w.patientId,
                  now: IN_WINDOW,
                  config: w.config,
                  order,
                }),
              () => cancelByPatient({ w, lich, stack }),
            ),
          check: async ({ lich }, results) => {
            const [paid, cancelled] = valuesOf(results) as [
              CheckInOutcome,
              CancelOutcome,
            ];
            const row = await readAppointment(db, lich.lichHenId);
            const rows = (await notificationRows(db)).filter(
              (r) => r.loai === FAKE_PAYMENT_EVENT,
            );
            if (paid.kind === 'CheckedIn') {
              expect(cancelled).toEqual({
                kind: 'NotCancellable',
                trangThai: 'DaTiepDon',
              });
              expect(row.trangThai).toBe('DaTiepDon');
              expect(rows).toHaveLength(1);
              tally.add('payment tiếp đón');
            } else {
              expect(paid).toEqual({
                kind: 'InvalidState',
                trangThai: 'DaHuy',
              });
              expect(cancelled.kind).toBe('Cancelled');
              expect(row.trangThai).toBe('DaHuy');
              // checkInFirst: chưa ghi dòng "thu tiền"; lockFirst ghi TRƯỚC khi biết kết quả (payment thật sẽ hoàn tác)
              expect(rows).toHaveLength(order === 'lockFirst' ? 1 : 0);
              tally.add('Bệnh nhân huỷ');
            }
            await assertBookingInvariants(db);
          },
        });
        report(name, rounds, tally.winners);
      },
      SLOW,
    );

  race('checkInFirst', 'CKI-08 checkInFirst', 30);
  race('lockFirst', 'CKI-08 lockFirst', 30);

  // HAI lần thu tiền cùng MỘT lịch (hai Lễ tân hay hai tab; B12-S). Mỗi bên ghi dòng với `loai_su_kien` RIÊNG: UNIQUE (lịch, tài khoản, loại) sẽ chặn bên thứ hai ngay ở INSERT nếu trùng loại và ca không còn đo khoá S rồi nâng lên X.
  // `started` cho hai bên xuất phát cùng lúc; `written` (chỉ dùng ở `writeFirst`, qua `afterFirstWrite`) giữ mỗi bên lại cho tới khi CẢ HAI đã ghi dòng có khoá ngoại và đang giữ khoá S trên `lich_hen`, rồi mới cho gọi `checkIn`
  // (khoá X): kết quả ĐỊNH TRƯỚC, không phụ thuộc thời điểm. Lần thử lại (cổng đã mở) chạy tự do.
  const twoPayments = (
    order: 'checkInFirst' | 'writeFirst',
    name: string,
    rounds: number,
    title: string,
  ) =>
    it(
      title,
      async () => {
        const w = await world();
        const tally = winnerTally();
        await runRounds({
          rounds,
          setup: async () => ({
            lich: (await fresh(w))[0]!,
            stack: createStatusStack(db),
            before: deadlocksSoFar(),
            written: createGate(2),
          }),
          race: ({ lich, stack, written }, round) => {
            const pay = (loaiSuKien: string) => () =>
              fakeCashCheckIn(db, stack.transition, {
                lichHenId: lich.lichHenId,
                taiKhoanId: w.patientId,
                now: IN_WINDOW,
                config: w.config,
                order,
                loaiSuKien,
                afterFirstWrite: () => written.arrive(),
              });
            return racePair(
              round,
              pay('FakeThanhToanA'),
              pay('FakeThanhToanB'),
            );
          },
          check: async ({ lich, before }, results, round) => {
            const [a, b] = valuesOf(results) as [
              CheckInOutcome,
              CheckInOutcome,
            ];
            expect([a.kind, b.kind].sort()).toEqual([
              'CheckedIn',
              'InvalidState',
            ]);
            expect(a.kind === 'InvalidState' ? a : b).toEqual({
              kind: 'InvalidState',
              trangThai: 'DaTiepDon',
            });
            expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
              'DaTiepDon',
            );
            const deadlocks = deadlocksSoFar() - before;
            if (order === 'writeFirst')
              expect(
                deadlocks,
                `vòng ${String(round)}: thứ tự đảo phải gây ít nhất một lần 1213`,
              ).toBeGreaterThanOrEqual(1);
            else
              expect(
                deadlocks,
                `vòng ${String(round)}: đúng thứ tự thì không có 1213`,
              ).toBe(0);
            await assertBookingInvariants(db);
            tally.add(
              a.kind === 'CheckedIn'
                ? 'payment A tiếp đón'
                : 'payment B tiếp đón',
            );
          },
        });
        // `writeFirst` CHỦ Ý gây 1213 (đối chứng ÂM): cho phép thử lại nhưng vẫn khẳng định 0 lần hết lượt (503)
        report(
          name,
          rounds,
          tally.winners,
          order === 'writeFirst' ? { retriesAllowed: true } : {},
        );
      },
      SLOW,
    );

  twoPayments(
    'writeFirst',
    'CKI-08 âm: hai lần thu tiền, thứ tự đảo',
    20,
    'đối chứng ÂM, thứ tự ĐẢO (writeFirst): HAI lần thu tiền cùng một lịch, mỗi bên ghi dòng có khoá ngoại TRƯỚC rồi mới checkIn; cổng bảo đảm cả hai đã giữ khoá S trước khi bên nào nâng lên X ⇒ ≥ 1 lần 1213 MỖI vòng (xác định); kết quả đúng: một CheckedIn, một InvalidState, 0 lần 503, INV',
  );
  twoPayments(
    'checkInFirst',
    'CKI-08 dương: hai lần thu tiền, đúng thứ tự',
    20,
    'đối chứng DƯƠNG, đúng thứ tự (checkInFirst): HAI lần thu tiền cùng một lịch đua tự do ⇒ 0 lần 1213 và 1205; một CheckedIn, một InvalidState; INV',
  );
});
