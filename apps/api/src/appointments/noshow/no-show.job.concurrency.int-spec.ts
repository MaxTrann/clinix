import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import type { CancelOutcome } from '../cancel/cancel.types.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import type {
  CheckInOutcome,
  ConfirmPaidOutcome,
  ExpireOutcome,
} from '../state/appointment-transition.service.js';
import { cancelInput } from '../testing/cancel-world.js';
import { sleep, valuesOf } from '../testing/concurrency-report.js';
import { createAppointmentWorld } from '../testing/create-appointment-world.js';
import { readAppointment } from '../testing/expiry-fixtures.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import {
  createNoShowStack,
  freshConfirmed,
  noShowWorld,
  outcomeOf,
  raceRounds,
  type NoShowStack,
} from '../testing/no-show-world.js';
import {
  notificationRows,
  resetBookingRound,
} from '../testing/payment-doctor-fakes.js';
import { db, fx, useStatusWorldHooks } from '../testing/status-int-kit.js';
import {
  AFTER_ALL_WINDOWS,
  checkInInput,
  readNoShow,
  runCheckIn,
  setNoShow,
} from '../testing/status-world.js';
import {
  emptyNoShowSummary,
  type NoShowSummary,
} from './no-show-sweep.service.js';

// Task B13 — các ca ĐỒNG THỜI của job tự Vắng mặt trên MySQL 8.4 THẬT (PLAN booking 7.6 VM-09 hai bản, VM-10; 7.10 DT-06; 7.35 NSJ-09, NSJ-10 `[đề xuất]`; TRACKING 3.29 B13-F). Mỗi vòng dựng lại dữ liệu, hai bên cùng xuất phát
// (`createGate` trong `racePair`), xen kẽ ai đi trước, kiểm kết quả rồi chạy INV-01…INV-05. Mọi yêu cầu qua `withBookingTransaction` thật (READ COMMITTED, thử lại ≤ 2, timeout chờ khoá 3 giây). Mỗi ca ĐẾM lần thử lại 1213/1205, GHI
// bên thắng mỗi vòng (dòng `[B13-DT]`) và khẳng định 0 lần hết lượt (503). CHẠY MỘT MÌNH (nhạy với tải máy).
//
// DỰ ĐOÁN ĐÃ GHI TRƯỚC KHI ĐO (TRACKING 3.29 B13-F, 13/11/2026; KHÔNG sửa lại nếu số đo lệch, chỉ ghi chỗ lệch):
//  D1 hai bản job (VM-09): 0 lần 1213/1205; tổng NoShowed = số lịch; so_lan_no_show đúng.
//  D2 job đua `checkIn` (VM-10): đúng một bên thắng mỗi vòng, cả hai bên thắng vài vòng; 1213 từ 0 đến 3 lần trên 40 vòng (điểm 0 hoặc 1); 0 lần hết lượt.
//  D3 job đua huỷ (DT-06): như D2.
//  D4 job đua `create` cùng tài khoản (NSJ-09): 0 lần thử lại.
//  D5 job đua `confirmPaid` và `expire` của CÙNG lịch DaXacNhan (NSJ-10, đối chứng): 0 lần thử lại (hai bên kia không ghi `lich_hen` nên không xin khoá S ngầm). CÓ THỂ SAI: đó là điều cần đo.
// Cơ chế đã đo ở B12 (B12-Q): `UPDATE lich_hen SET trang_thai` của `cancel` và `checkIn` xin NGẦM khoá S trên hàng cha `benh_nhan` sau khi giữ X trên `lich_hen`, còn job khoá `benh_nhan` rồi `lich_hen`: D2 và D3 cho phép thử lại
// (`retriesAllowed`) nhưng vẫn khẳng định kết quả đúng; D1, D4, D5 KHÔNG cho phép.
const ROUNDS = 40;
const SLOW = 180_000;
const { CANCELLED, NO_SHOW, NO_SHOW_LOCK } = BOOKING_NOTIFICATION_EVENTS;
const HIDDEN_FK_LOCK = { retriesAllowed: true } as const;
const ZERO = emptyNoShowSummary();
// Vòng chẵn, bên thứ hai bị lùi thêm để JOB đi trước hẳn (racePair chỉ lùi 4 ms, ít hơn thời gian job chọn ứng viên rồi mới khoá lịch)
const JOB_LEAD_MS = 15;
const fixedLead = (round: number): number =>
  round % 2 === 0 ? JOB_LEAD_MS : 0;
// Ca QUÉT độ lệch (thêm 13/11/2026 SAU khi hai ca độ lệch cố định cho bên thắng chia đúng 20/20 và 0 lần thử lại: kết quả bị quyết định bởi thứ tự xuất phát, có thể chưa phủ cửa sổ giao nhau hẹp): bên thứ hai lùi
// `round % 13` ms (0 đến 12); cộng 4 ms của `racePair` ở vòng chẵn hay trừ 4 ms ở vòng lẻ cho độ lệch tương đối từ −4 đến +16 ms. Thêm, KHÔNG thay: hai ca độ lệch cố định và mọi khẳng định của chúng giữ nguyên.
const SWEEP_ROUNDS = 65;
const sweepLead = (round: number): number => round % 13;

useStatusWorldHooks();

const events = async (): Promise<string[]> =>
  (await notificationRows(db)).map((row) => row.loai).sort();

describe('VM-09 hai bản job chạy cùng lúc trên cùng tập lịch (D1; ≥ 30 vòng): mỗi lịch đúng một lần, số lần no-show đúng, 0 lỗi 1213/1205', () => {
  // `delayFor(round)`: số ms bản job thứ hai lùi thêm so với bản thứ nhất ở vòng đó (cộng hay trừ 4 ms của `racePair`)
  const race = async (
    name: string,
    rounds: number,
    delayFor: (round: number) => number,
  ) => {
    const w = await noShowWorld(db, fx);
    return raceRounds({
      name,
      rounds,
      // hai nửa: bắt đầu {0, chưa khoá} (đạt ngưỡng ở lịch thứ ba) và {3, đã khoá} (chỉ tăng số)
      setup: async (round) => {
        const before =
          round % 2 === 0
            ? { soLan: 3, khoa: true }
            : { soLan: 0, khoa: false };
        return {
          before,
          lich: await freshConfirmed(db, w, {
            counter: before,
            slots: [0, 1, 2],
          }),
        };
      },
      first: () => createNoShowStack(db).job.run(AFTER_ALL_WINDOWS),
      second: async (_context, round) => {
        const lead = delayFor(round);
        if (lead > 0) await sleep(lead);
        return createNoShowStack(db).job.run(AFTER_ALL_WINDOWS);
      },
      check: async ({ before, lich }, results, tally) => {
        const [one, two] = valuesOf(results) as [NoShowSummary, NoShowSummary];
        for (const summary of [one, two]) {
          expect(summary.failedBusy + summary.failedError).toBe(0);
          expect(summary.notDue).toBe(0);
        }
        expect(one.noShowed + two.noShowed).toBe(3);
        for (const l of lich)
          expect((await readAppointment(db, l.lichHenId)).trangThai).toBe(
            'VangMat',
          );
        expect(await readNoShow(db, w.patientId)).toEqual({
          soLan: before.soLan + 3,
          khoa: true,
        });
        expect(await events()).toEqual(
          before.khoa
            ? [NO_SHOW, NO_SHOW, NO_SHOW]
            : [NO_SHOW, NO_SHOW, NO_SHOW, NO_SHOW_LOCK].sort(),
        );
        tally.add(
          one.noShowed > two.noShowed
            ? 'bản một nhiều hơn'
            : one.noShowed < two.noShowed
              ? 'bản hai nhiều hơn'
              : 'chia đều',
        );
        await assertBookingInvariants(db);
      },
    });
  };

  it(
    `${String(ROUNDS)} vòng, độ lệch của racePair: tổng NoShowed của hai bản = 3 lịch, mỗi lịch VangMat đúng một lần; so_lan_no_show +3; cờ khoá và thông báo khoá đúng MỘT lần khi vượt ngưỡng; 0 thử lại`,
    async () => {
      const winners = await race('VM-09 hai bản job', ROUNDS, () => 0);
      expect(Object.values(winners).reduce((sum, n) => sum + n, 0)).toBe(
        ROUNDS,
      );
    },
    SLOW,
  );

  it(
    `${String(SWEEP_ROUNDS)} vòng QUÉT độ lệch xuất phát (bản hai lùi 0 đến 12 ms): vẫn 0 thử lại, mỗi lịch đúng một lần`,
    async () => {
      await race('VM-09 hai bản job (quét độ lệch)', SWEEP_ROUNDS, sweepLead);
    },
    SLOW,
  );
});

describe('VM-10 Lễ tân tiếp đón cùng lúc job tự Vắng mặt CÙNG một lịch (D2; ≥ 30 vòng; cửa sổ tiếp đón còn mở SAU giờ kết thúc ca)', () => {
  // `delayFor(round)`: số ms bên thứ hai (Lễ tân) lùi thêm so với job ở vòng đó (cộng hay trừ 4 ms của `racePair`)
  const race = async (
    name: string,
    rounds: number,
    delayFor: (round: number) => number,
  ) => {
    const w = await noShowWorld(db, fx);
    // check_in_sau_phut đủ lớn để Lễ tân còn tiếp đón được lúc 12:00, SAU giờ kết thúc ca (12:00): khung giờ cuối của ca (11:30) có cửa sổ [11:00, 21:30]
    const config = await fx.systemConfig({ checkInSauPhut: 600 });
    return raceRounds({
      name,
      rounds,
      options: HIDDEN_FK_LOCK,
      setup: async () => ({
        lich: (await freshConfirmed(db, w, { slots: [7] }))[0]!,
        stack: createNoShowStack(db),
      }),
      first: ({ stack }) => stack.job.run(AFTER_ALL_WINDOWS),
      second: async ({ lich, stack }, round) => {
        const lead = delayFor(round);
        if (lead > 0) await sleep(lead);
        return runCheckIn(
          db,
          stack.transition,
          checkInInput(w, lich.lichHenId, 'LeTan', {
            now: AFTER_ALL_WINDOWS,
            config,
          }),
        );
      },
      check: async ({ lich }, results, tally) => {
        const [summary, checked] = valuesOf(results) as [
          NoShowSummary,
          CheckInOutcome,
        ];
        const row = await readAppointment(db, lich.lichHenId);
        const counter = await readNoShow(db, w.patientId);
        if (checked.kind === 'CheckedIn') {
          // job vào sau: không còn là ứng viên (đã DaTiepDon lúc quét) hay là ứng viên rồi thấy DaTiepDon dưới khoá
          expect([ZERO, { ...ZERO, notConfirmed: 1 }]).toContainEqual(summary);
          expect(row.trangThai).toBe('DaTiepDon');
          expect(counter).toEqual({ soLan: 0, khoa: false });
          expect(await notificationRows(db)).toEqual([]);
          tally.add('Lễ tân tiếp đón');
        } else {
          expect(checked).toEqual({
            kind: 'InvalidState',
            trangThai: 'VangMat',
          });
          expect(summary).toEqual({ ...ZERO, noShowed: 1 });
          expect(row.trangThai).toBe('VangMat');
          expect(counter).toEqual({ soLan: 1, khoa: false });
          expect(await events()).toEqual([NO_SHOW]);
          tally.add('Job Vắng mặt');
        }
        expect((await fx.slotState(w.slotId(7))).trangThai).toBe('DaDat');
        await assertBookingInvariants(db);
      },
    });
  };

  it(
    `${String(ROUNDS)} vòng, độ lệch cố định (vòng chẵn job đi trước hẳn): đúng MỘT kết quả (DaTiepDon hay VangMat); bên thua nhận kết quả của bên thắng; số lần no-show chỉ +1 khi Vắng mặt thắng; cả hai bên thắng ít nhất vài vòng; INV`,
    async () => {
      const winners = await race('VM-10 job đua checkIn', ROUNDS, fixedLead);
      expect(winners['Lễ tân tiếp đón'] ?? 0).toBeGreaterThanOrEqual(3);
      expect(winners['Job Vắng mặt'] ?? 0).toBeGreaterThanOrEqual(3);
    },
    SLOW,
  );

  it(
    `${String(SWEEP_ROUNDS)} vòng QUÉT độ lệch xuất phát (Lễ tân lùi 0 đến 12 ms, cộng hay trừ 4 ms của racePair: độ lệch tương đối từ −4 đến +16 ms) để phủ cửa sổ giao nhau hẹp của hai bên: cùng khẳng định từng vòng`,
    async () => {
      await race(
        'VM-10 job đua checkIn (quét độ lệch)',
        SWEEP_ROUNDS,
        sweepLead,
      );
    },
    SLOW,
  );
});

describe('DT-06 Bệnh nhân huỷ cùng lúc job tự Vắng mặt (D3; ≥ 30 vòng): đúng một kết quả; không giải phóng sai', () => {
  const race = async (
    name: string,
    rounds: number,
    delayFor: (round: number) => number,
  ) => {
    const w = await noShowWorld(db, fx);
    return raceRounds({
      name,
      rounds,
      options: HIDDEN_FK_LOCK,
      setup: async () => ({
        lich: (await freshConfirmed(db, w, { slots: [0] }))[0]!,
        stack: createNoShowStack(db),
      }),
      first: ({ stack }) => stack.job.run(AFTER_ALL_WINDOWS),
      second: async ({ lich, stack }, round) => {
        const lead = delayFor(round);
        if (lead > 0) await sleep(lead);
        return stack.cancellation.cancel(
          cancelInput(w, 'BenhNhan', lich.maLichHen),
        );
      },
      check: async ({ lich, stack }, results, tally) => {
        const [summary, cancelled] = valuesOf(results) as [
          NoShowSummary,
          CancelOutcome,
        ];
        const row = await readAppointment(db, lich.lichHenId);
        const counter = await readNoShow(db, w.patientId);
        if (cancelled.kind === 'Cancelled') {
          expect([ZERO, { ...ZERO, notConfirmed: 1 }]).toContainEqual(summary);
          expect(row.trangThai).toBe('DaHuy');
          expect(counter).toEqual({ soLan: 0, khoa: false });
          expect((await fx.slotState(w.slotId(0))).trangThai).toBe('ConTrong');
          expect(await events()).toEqual([CANCELLED]);
          // giờ hẹn còn ở tương lai so với đồng hồ ứng dụng giả (T0) nên mời đúng một lần
          expect(stack.ports.waitlist.onSlotReleasedCall.count).toBe(1);
          tally.add('Bệnh nhân huỷ');
        } else {
          expect(cancelled).toEqual({
            kind: 'NotCancellable',
            trangThai: 'VangMat',
          });
          expect(summary).toEqual({ ...ZERO, noShowed: 1 });
          expect(row.trangThai).toBe('VangMat');
          expect(counter).toEqual({ soLan: 1, khoa: false });
          expect((await fx.slotState(w.slotId(0))).trangThai).toBe('DaDat');
          expect(await events()).toEqual([NO_SHOW]);
          expect(stack.ports.waitlist.onSlotReleasedCall.count).toBe(0);
          tally.add('Job Vắng mặt');
        }
        await assertBookingInvariants(db);
      },
    });
  };

  it(
    `${String(ROUNDS)} vòng, độ lệch cố định: huỷ thắng ⇒ DaHuy, khung giờ ConTrong, mời chờ một lần, số lần không đổi; job thắng ⇒ VangMat, khung giờ GIỮ DaDat, không mời chờ, +1; cả hai bên thắng ít nhất vài vòng; INV`,
    async () => {
      const winners = await race('DT-06 job đua huỷ', ROUNDS, fixedLead);
      expect(winners['Bệnh nhân huỷ'] ?? 0).toBeGreaterThanOrEqual(3);
      expect(winners['Job Vắng mặt'] ?? 0).toBeGreaterThanOrEqual(3);
    },
    SLOW,
  );

  it(
    `${String(SWEEP_ROUNDS)} vòng QUÉT độ lệch xuất phát (Bệnh nhân lùi 0 đến 12 ms, cộng hay trừ 4 ms của racePair): cùng khẳng định từng vòng`,
    async () => {
      await race('DT-06 job đua huỷ (quét độ lệch)', SWEEP_ROUNDS, sweepLead);
    },
    SLOW,
  );
});

describe('NSJ-09 job tự Vắng mặt cùng lúc tạo lịch mới của CÙNG tài khoản (D4; create THẬT của B8; hai thứ tự xuất phát; ≥ 30 vòng)', () => {
  const race = async (
    name: string,
    rounds: number,
    delayFor: (round: number) => number,
  ) => {
    const w = await createAppointmentWorld(db, fx);
    const stack = createNoShowStack(db);
    const newSlot = 4;
    // lịch CỦA job nằm ở ca sáng ngày 09/11/2026 (đã kết thúc lúc 12:00 cùng ngày); lịch sắp tạo ở ca 10/11 chưa kết thúc nên job không đụng tới nó
    const monday = await fx.doctor.shiftWithSlots(w.doctor.profile, {
      ngay: '2026-11-09',
      ca: 'CaSang',
    });
    const jobNow = new Date('2026-11-09T12:00:00+07:00');
    return raceRounds({
      name,
      rounds,
      setup: async () => {
        await resetBookingRound(db);
        await setNoShow(db, w.patientId, { soLan: 2, khoa: false });
        const khungGioId = monday.slotIds[0]!;
        return {
          lich: await fx.appointmentIn('DaXacNhan', {
            doctor: w.doctor.profile,
            khungGioId,
            patientId: w.patientId,
          }),
        };
      },
      first: () => stack.job.run(jobNow),
      second: async (_context, round) => {
        const lead = delayFor(round);
        if (lead > 0) await sleep(lead);
        return outcomeOf(w.create(newSlot));
      },
      check: async ({ lich }, results, tally) => {
        const [summary, created] = valuesOf(results) as [
          NoShowSummary,
          Awaited<ReturnType<typeof outcomeOf>>,
        ];
        expect(summary).toEqual({ ...ZERO, noShowed: 1 });
        expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
          'VangMat',
        );
        expect(await readNoShow(db, w.patientId)).toEqual({
          soLan: 3,
          khoa: true,
        });
        expect(await events()).toEqual([NO_SHOW, NO_SHOW_LOCK].sort());
        const newSlotState = (await fx.slotState(w.slot(newSlot))).trangThai;
        if (created.kind === 'ok') {
          expect(newSlotState).toBe('DaDat'); // cọc 0đ: vào thẳng DaXacNhan, khung giờ DaDat
          tally.add('tạo vào trước');
        } else {
          expect(created).toEqual({
            kind: 'refused',
            maLoi: 'DAT_LICH_BI_KHOA_NO_SHOW',
          });
          expect(newSlotState).toBe('ConTrong');
          tally.add('job vào trước');
        }
        await w.expectSettled(newSlot);
      },
    });
  };

  it(
    `${String(ROUNDS)} vòng, độ lệch của racePair: tạo vào trước ⇒ có lịch mới; job vào trước và đạt ngưỡng ⇒ 403 DAT_LICH_BI_KHOA_NO_SHOW, khung giờ vẫn ConTrong; luôn VangMat + cờ khoá; 0 thử lại; INV`,
    async () => {
      const winners = await race('NSJ-09 job đua create', ROUNDS, () => 0);
      expect(Object.values(winners).reduce((sum, n) => sum + n, 0)).toBe(
        ROUNDS,
      );
    },
    SLOW,
  );

  it(
    `${String(SWEEP_ROUNDS)} vòng QUÉT độ lệch xuất phát (tạo lịch lùi 0 đến 12 ms): vẫn 0 thử lại, cùng khẳng định từng vòng`,
    async () => {
      await race(
        'NSJ-09 job đua create (quét độ lệch)',
        SWEEP_ROUNDS,
        sweepLead,
      );
    },
    SLOW,
  );
});

describe('NSJ-10 job tự Vắng mặt cùng lúc confirmPaid hay expire của CÙNG lịch DaXacNhan (D5, đối chứng; ≥ 30 vòng): hai bên kia không ghi lich_hen nên không có chu trình', () => {
  /** Hai bên: job, và `other` (confirmPaid hay expire) lùi `delayFor(round)` ms; `check` kiểm kết quả của `other` */
  const race = async <Other>(spec: {
    name: string;
    rounds: number;
    delayFor: (round: number) => number;
    other: (c: { lichHenId: string; stack: NoShowStack }) => Promise<Other>;
    checkOther: (
      other: Other,
      c: { stack: NoShowStack },
      tally: { add: (label: string) => void },
    ) => void;
  }) => {
    const w = await noShowWorld(db, fx);
    return raceRounds({
      name: spec.name,
      rounds: spec.rounds,
      setup: async () => ({
        lich: (await freshConfirmed(db, w, { slots: [0] }))[0]!,
        stack: createNoShowStack(db),
      }),
      first: ({ stack }) => stack.job.run(AFTER_ALL_WINDOWS),
      second: async ({ lich, stack }, round) => {
        const lead = spec.delayFor(round);
        if (lead > 0) await sleep(lead);
        return spec.other({ lichHenId: lich.lichHenId, stack });
      },
      check: async ({ lich, stack }, results, tally) => {
        const [summary, other] = valuesOf(results) as [NoShowSummary, Other];
        expect(summary).toEqual({ ...ZERO, noShowed: 1 });
        expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
          'VangMat',
        );
        expect(await readNoShow(db, w.patientId)).toEqual({
          soLan: 1,
          khoa: false,
        });
        expect((await fx.slotState(w.slotId(0))).trangThai).toBe('DaDat');
        spec.checkOther(other, { stack }, tally);
        await assertBookingInvariants(db);
      },
    });
  };

  const confirmPaid = (
    name: string,
    rounds: number,
    delayFor: (round: number) => number,
  ) =>
    race<ConfirmPaidOutcome>({
      name,
      rounds,
      delayFor,
      other: ({ lichHenId, stack }) =>
        withBookingTransaction(
          db,
          (em) =>
            stack.transition.confirmPaid(em, {
              lichHenId,
              soTienDaThu: '0.00',
            }),
          { label: 'confirm-paid-vs-job' },
        ),
      checkOther: (confirmed, _c, tally) => {
        if (confirmed.kind === 'AlreadyConfirmed') {
          tally.add('confirmPaid vào trước');
        } else {
          expect(confirmed).toEqual({
            kind: 'InvalidState',
            trangThai: 'VangMat',
          });
          tally.add('job vào trước');
        }
      },
    });

  const expire = (
    name: string,
    rounds: number,
    delayFor: (round: number) => number,
  ) =>
    race<ExpireOutcome>({
      name,
      rounds,
      delayFor,
      other: ({ lichHenId, stack }) =>
        stack.transition.expire({ lichHenId, now: AFTER_ALL_WINDOWS }),
      checkOther: (expired, { stack }, tally) => {
        expect(expired).toEqual({ kind: 'NotDue', reason: 'NotPending' });
        expect(stack.ports.waitlist.onSlotReleasedCall.count).toBe(0);
        tally.add('job Vắng mặt');
      },
    });

  it(
    `${String(ROUNDS)} vòng job đua confirmPaid: job luôn NoShowed; confirmPaid ra AlreadyConfirmed (vào trước) hay InvalidState VangMat (vào sau); 0 thử lại; INV`,
    async () => {
      await confirmPaid('NSJ-10 job đua confirmPaid', ROUNDS, () => 0);
    },
    SLOW,
  );

  it(
    `${String(SWEEP_ROUNDS)} vòng QUÉT độ lệch xuất phát, job đua confirmPaid (confirmPaid lùi 0 đến 12 ms): vẫn 0 thử lại`,
    async () => {
      await confirmPaid(
        'NSJ-10 job đua confirmPaid (quét độ lệch)',
        SWEEP_ROUNDS,
        sweepLead,
      );
    },
    SLOW,
  );

  it(
    `${String(ROUNDS)} vòng job đua expire: job luôn NoShowed; expire ra NotDue NotPending cả hai thứ tự; không giải phóng khung giờ, không mời chờ; 0 thử lại; INV`,
    async () => {
      await expire('NSJ-10 job đua expire', ROUNDS, () => 0);
    },
    SLOW,
  );

  it(
    `${String(SWEEP_ROUNDS)} vòng QUÉT độ lệch xuất phát, job đua expire (expire lùi 0 đến 12 ms): vẫn 0 thử lại`,
    async () => {
      await expire(
        'NSJ-10 job đua expire (quét độ lệch)',
        SWEEP_ROUNDS,
        sweepLead,
      );
    },
    SLOW,
  );
});
