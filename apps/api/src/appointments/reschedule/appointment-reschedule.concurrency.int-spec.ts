import type { DataSource } from 'typeorm';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import type { CancelOutcome } from '../cancel/cancel.types.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { createCancelStack } from '../testing/cancel-world.js';
import { createGate, runRounds } from '../testing/concurrency-harness.js';
import {
  reportRounds,
  sleep,
  valuesOf,
  winnerTally,
} from '../testing/concurrency-report.js';
import {
  rescheduleServiceWorld,
  type RescheduleServiceWorld,
} from '../testing/reschedule-service-world.js';
import { interceptStatements } from '../testing/statement-recorder.js';
import type { RescheduleOutcome } from './reschedule.types.js';

// reschedule B4 — DLH-19, DLH-33, DLH-34 (mã `[đề xuất]` từ DLH-33) ĐỒNG THỜI trên MySQL 8.4 THẬT bằng dịch vụ thật (PLAN reschedule 5.4, 3.5 R1; X1 M1 và M8; TRACKING reschedule 1.7). Mỗi vòng dựng lại dữ liệu,
// các bên cùng xuất phát qua MỘT cổng (`createGate`, bên đầu xen kẽ theo vòng), rồi kiểm kết quả, INV-1…INV-10 và số lần thử lại 1213/1205 (`retryStats` qua `reportRounds`). Mọi yêu cầu qua `withBookingTransaction` thật:
// "không lỗi" là SAU thử lại, nên số thử lại khác 0 ở ca khẳng định 0 là THỨ TỰ KHOÁ SAI. Số vòng và số lần thử lại in ra ở dòng `[B4-…]`; việc đếm toàn bộ cặp đồng thời là của X2 (TDL-01…TDL-18). CHẠY MỘT MÌNH.
const ROUNDS = 12;

let db: DataSource;
let fx: BookingFixtures;
let logs: string[] = [];
useIntegrationHooks((d, captured) => {
  db = d;
  fx = new BookingFixtures(d);
  logs = captured;
});

/** Xoá mọi lịch (con trước, vì lịch mới trỏ lịch cũ) và đặt mọi khung giờ về `ConTrong`, đặt lại bộ đếm của cổng Fake: dựng lại trạng thái đầu mỗi vòng. */
async function reset(w: RescheduleServiceWorld): Promise<void> {
  await db.query('DELETE FROM lich_hen ORDER BY lich_hen_id DESC');
  await db.query(
    "UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL",
  );
  w.notifier.notifyCall.reset();
  w.waitlist.onSlotReleasedCall.reset();
}

/** Hai việc xuất phát CÙNG LÚC; vòng lẻ việc thứ hai chậm 4 ms, vòng chẵn việc thứ nhất chậm 4 ms: xen kẽ ai đi trước để CẢ HAI nhánh thắng đều chạy. */
function pair<A, B>(
  round: number,
  first: () => Promise<A>,
  second: () => Promise<B>,
) {
  const gate = createGate(2);
  return [
    async (): Promise<A | B> => {
      await gate.arrive();
      if (round % 2 === 0) await sleep(4);
      return first();
    },
    async (): Promise<A | B> => {
      await gate.arrive();
      if (round % 2 === 1) await sleep(4);
      return second();
    },
  ] as const;
}

const slotBooked = {
  kind: 'Rejected',
  failure: { kind: 'Rule', code: BOOKING_ERROR_CODES.SLOT_BOOKED },
};

describe('DLH-19 bấm đúp: hai lần gửi cùng lúc, cùng khung giờ', () => {
  it(`${String(ROUNDS)} vòng: đúng MỘT lịch mới; bên còn lại NotFound (lịch cũ đã DaDoiLich, Q31); onSlotReleased đúng một lần; 0 lần thử lại (cùng khoá benh_nhan nên tuần tự)`, async () => {
    const w = await rescheduleServiceWorld(db, fx);
    const tally = winnerTally();

    await runRounds<LichHen, RescheduleOutcome>({
      rounds: ROUNDS,
      setup: async () => {
        await reset(w);
        return w.book(0);
      },
      race: (lich, round) =>
        pair(
          round,
          () => w.service.reschedule(w.tuDoi(lich.maLichHen, 2)),
          () => w.service.reschedule(w.tuDoi(lich.maLichHen, 2)),
        ),
      check: async (lich, results) => {
        const outcomes = valuesOf(results);
        expect(outcomes.filter((o) => o.kind === 'Rescheduled')).toHaveLength(
          1,
        );
        expect(outcomes.find((o) => o.kind !== 'Rescheduled')).toStrictEqual({
          kind: 'Rejected',
          failure: { kind: 'NotFound' },
        });
        expect(await w.countRows('lich_hen')).toBe(2);
        expect((await w.rowOf(lich.lichHenId)).trangThai).toBe('DaDoiLich');
        expect(w.waitlist.onSlotReleasedCall.count).toBe(1);
        await w.expectSettled();
        tally.add('một lịch mới');
      },
    });

    reportRounds('B4-DLH-19', 'bấm đúp', ROUNDS, tally.winners, logs);
  });
});

describe('DLH-33 đổi × huỷ CÙNG MỘT lịch', () => {
  it(`${String(ROUNDS)} vòng: luôn có đúng một bên thắng, kết quả cuối nhất quán (đổi thắng thì huỷ không còn Cancelled; huỷ thắng thì đổi bị LICH_HEN_KHONG_CHO_DOI DaHuy), không 500, không 503; số lần 1213 được GHI (B12 R, TECH_DEBT 113, 268: nạn nhân là bên đổi)`, async () => {
    const w = await rescheduleServiceWorld(db, fx);
    const cancel = createCancelStack(db).service;
    const tally = winnerTally();

    await runRounds<LichHen, RescheduleOutcome | CancelOutcome>({
      rounds: ROUNDS,
      setup: async () => {
        await reset(w);
        return w.book(0);
      },
      race: (lich, round) =>
        pair<RescheduleOutcome, CancelOutcome>(
          round,
          () => w.service.reschedule(w.tuDoi(lich.maLichHen, 2)),
          () =>
            cancel.cancel({
              maLichHen: lich.maLichHen,
              actor: { kind: 'BenhNhan', accountId: w.patientId },
              reason: 'BenhNhanHuy',
            }),
        ),
      check: async (lich, results) => {
        const [resched, cancelled] = valuesOf(results) as [
          RescheduleOutcome,
          CancelOutcome,
        ];
        if (resched.kind === 'Rescheduled') {
          tally.add('đổi');
          expect(cancelled.kind).not.toBe('Cancelled');
          expect((await w.rowOf(lich.lichHenId)).trangThai).toBe('DaDoiLich');
          expect(await w.countRows('lich_hen')).toBe(2);
          await w.expectSlot(0, 'ConTrong');
          await w.expectSlot(2, 'DaDat');
        } else {
          tally.add('huỷ');
          expect(resched).toMatchObject({
            kind: 'Rejected',
            failure: {
              kind: 'Rule',
              code: BOOKING_ERROR_CODES.NOT_RESCHEDULABLE,
              chiTiet: { trangThai: 'DaHuy' },
            },
          });
          expect(cancelled.kind).toBe('Cancelled');
          expect(await w.countRows('lich_hen')).toBe(1);
          await w.expectSlot(0, 'ConTrong');
          await w.expectSlot(2, 'ConTrong');
          expect(w.waitlist.onSlotReleasedCall.count).toBe(0);
        }
        await w.expectSettled();
      },
    });

    reportRounds('B4-DLH-33', 'đổi × huỷ', ROUNDS, tally.winners, logs, {
      retriesAllowed: true,
    });
  });
});

describe('DLH-34 hoán vị và tranh cùng khung giờ mới (id 9 và 10: so BẰNG số, không so chuỗi)', () => {
  it(`hoán vị X↔Y, ${String(ROUNDS)} vòng: A đổi 9 → 10, B đổi 10 → 9 ⇒ cả hai KHUNG_GIO_DA_DAT (khung giờ đích đang DaDat bởi lịch của bên kia), 0 lần thử lại (R1: hai khung giờ luôn khoá theo id tăng dần)`, async () => {
    const w = await rescheduleServiceWorld(db, fx);
    const afternoon = await fx.doctor.shiftWithSlots(w.doctor, {
      ngay: '2026-11-10',
      ca: 'CaChieu',
    });
    expect(afternoon.slotIds.slice(0, 2)).toEqual(['9', '10']);
    const [second] = await fx.patients(1);
    const secondId = second!.account.taiKhoanId;
    const tally = winnerTally();
    // Giữ 20 ms SAU mỗi câu khoá khung giờ (như X1 M1 và B1 HDL-14): hai bên chắc chắn gặp nhau GIỮA hai khoá, nên thứ tự "cũ rồi mới" ra 1213 ở mọi vòng. Không có độ trễ này đột biến M21
    // (bỏ sắp xếp tăng dần) SỐNG SÓT: cửa sổ giữa hai khoá chỉ một câu truy vấn nên 12 vòng không đụng nhau (đã thấy ở lần chạy đột biến đầu của B4).
    interceptStatements(db, async (call, run) => {
      const result = await run();
      if (/FROM khung_gio\b[\s\S]*FOR UPDATE/i.test(call.sql)) await sleep(20);
      return result;
    });

    await runRounds<[LichHen, LichHen], RescheduleOutcome>({
      rounds: ROUNDS,
      setup: async () => {
        await reset(w);
        return [await w.book('9'), await w.book('10', { patientId: secondId })];
      },
      race: ([a, b], round) =>
        pair(
          round,
          () => w.service.reschedule(w.tuDoi(a.maLichHen, '10')),
          () => w.service.reschedule(w.tuDoi(b.maLichHen, '9', secondId)),
        ),
      check: async ([a, b], results) => {
        expect(valuesOf(results)).toStrictEqual([slotBooked, slotBooked]);
        expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaXacNhan');
        expect((await w.rowOf(b.lichHenId)).trangThai).toBe('DaXacNhan');
        expect(await w.countRows('lich_hen')).toBe(2);
        await w.expectSettled();
        tally.add('cả hai KHUNG_GIO_DA_DAT');
      },
    });

    reportRounds('B4-DLH-34', 'hoán vị', ROUNDS, tally.winners, logs);
  });

  it(`hai Bệnh nhân cùng đổi sang MỘT khung giờ, ${String(ROUNDS)} vòng: đúng một bên đổi được, bên kia KHUNG_GIO_DA_DAT; khung giờ đích DaDat đúng một lịch; 0 lần thử lại`, async () => {
    const w = await rescheduleServiceWorld(db, fx);
    const [second] = await fx.patients(1);
    const secondId = second!.account.taiKhoanId;
    const tally = winnerTally();

    await runRounds<[LichHen, LichHen], RescheduleOutcome>({
      rounds: ROUNDS,
      setup: async () => {
        await reset(w);
        return [await w.book(0), await w.book(1, { patientId: secondId })];
      },
      race: ([a, b], round) =>
        pair(
          round,
          () => w.service.reschedule(w.tuDoi(a.maLichHen, 2)),
          () => w.service.reschedule(w.tuDoi(b.maLichHen, 2, secondId)),
        ),
      check: async ([a, b], results) => {
        const outcomes = valuesOf(results);
        expect(outcomes.filter((o) => o.kind === 'Rescheduled')).toHaveLength(
          1,
        );
        expect(outcomes.find((o) => o.kind !== 'Rescheduled')).toStrictEqual(
          slotBooked,
        );
        const winnerIsA = outcomes[0]?.kind === 'Rescheduled';
        tally.add(winnerIsA ? 'bên A' : 'bên B');
        expect(
          (await w.rowOf(winnerIsA ? a.lichHenId : b.lichHenId)).trangThai,
        ).toBe('DaDoiLich');
        expect(
          (await w.rowOf(winnerIsA ? b.lichHenId : a.lichHenId)).trangThai,
        ).toBe('DaXacNhan');
        await w.expectSlot(2, 'DaDat');
        await w.expectSettled();
      },
    });

    reportRounds(
      'B4-DLH-34',
      'tranh một khung giờ',
      ROUNDS,
      tally.winners,
      logs,
    );
  });
});
