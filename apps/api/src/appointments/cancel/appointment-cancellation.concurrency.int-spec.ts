import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  isDeadlockError,
  isForeignKeyError,
  isLockWaitTimeoutError,
} from '../../database/mysql-errors.js';
import { ShiftRemovalRepository } from '../../doctor/shifts/shift-removal.repository.js';
import {
  HOLD_EXPIRED_CANCEL_REASON,
  PATIENT_CANCEL_REASON,
} from '../appointments.constants.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { FLOW_NOW } from '../testing/booking-flow.js';
import {
  cancelInput,
  cancelWorld,
  changeStatusLikeStaff,
  createCancelStack,
  DEPOSIT,
  REFUND_POLICY,
  type CancelWorld,
} from '../testing/cancel-world.js';
import {
  createGate,
  runRounds,
  summarize,
} from '../testing/concurrency-harness.js';
import {
  createExpiryStack,
  readAppointment,
} from '../testing/expiry-fixtures.js';
import { createFakePorts } from '../testing/fake-ports.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import type { ExpireOutcome } from '../state/appointment-transition.service.js';
import type { CancelOutcome } from './cancel.types.js';

// Task B10 — huỷ lịch hẹn ĐỒNG THỜI trên MySQL 8.4 THẬT (PLAN booking 7.3 HL-18; 7.10 DT-05, DT-06, DT-07, DT-08; TRACKING 3.23 B10-I). Mỗi vòng dựng lại dữ liệu, các bên cùng xuất phát qua MỘT cổng (`createGate`), rồi
// kiểm kết quả và chạy `assertBookingInvariants` (INV-01…INV-05). Mọi yêu cầu qua `withBookingTransaction` thật (READ COMMITTED, thử lại ≤ 2, timeout chờ khoá 3 giây): "0 deadlock" là SAU thử lại, nên bất kỳ lỗi
// nào còn sót (1213, 1205, lỗi lạ) hiện ra là yêu cầu bị TỪ CHỐI (`reasons` khác rỗng) và ca đỏ. CHẠY MỘT MÌNH (nhạy với tải máy, như DT-01).
// DT-05 và DT-06 là "một phần (B10)": bên kia là giao dịch GIẢ đi đúng chuỗi khoá của `checkIn` (B12) và job Vắng mặt (B13); khi hai việc đó có mã thật, chạy lại với hàm thật.
const ROUNDS = 40;

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});
const world = () => cancelWorld(db, fx);

const resetAll = async () => {
  await db.query('DELETE FROM lich_hen');
  await db.query(
    "UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL",
  );
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Mọi yêu cầu của vòng phải XONG (kết quả có kiểu, không ném): lỗi sót là deadlock, hết giờ chờ khoá hay lỗi lạ. */
const valuesOf = <T>(results: readonly PromiseSettledResult<T>[]): T[] => {
  const { values, reasons } = summarize(results);
  if (reasons.length > 0)
    throw new Error(`yêu cầu ném lỗi: ${String(reasons[0])}`);
  return values;
};

/** Dữ liệu dựng lại SẠCH rồi một lịch ở khung giờ số 0 có cọc và chính sách hoàn minh hoạ (đã thu bao nhiêu do cổng giả quyết). */
async function freshAppointment(
  w: CancelWorld,
  state: 'DaXacNhan' | 'ChoThanhToan',
) {
  await resetAll();
  return w.booked(state, 0, { coc: DEPOSIT, policy: REFUND_POLICY });
}

/** Giao dịch GIẢ của gỡ ca của `doctor`: CHÍNH SQL của doctor (`ShiftRemovalRepository`): `bac_si FOR UPDATE`, `khung_gio FOR UPDATE` cả ca, rồi `DELETE` khung giờ và ca (nơi gọi thật kiểm trước, ở đây bỏ qua để chạm lưới 1451). */
const removeShiftLikeDoctor = (
  repo: ShiftRemovalRepository,
  shift: { lichLamViecId: string; bacSiId: string },
) =>
  repo.transaction(async (em) => {
    await repo.lockDoctor(em, shift.bacSiId);
    await repo.lockSlots(em, shift.lichLamViecId);
    await repo.deleteShiftWithSlots(em, shift.lichLamViecId);
  });

describe('HL-18 cancel đồng thời với DELETE khung_gio của gỡ ca của doctor (doctor M12; ≥ 30 vòng, luân phiên bên nào đi trước)', () => {
  it(`${String(ROUNDS)} vòng: không 1213 hay 1205 nào; DELETE bị 1451 (lịch còn tham chiếu khung giờ, kể cả DaHuy) và hoàn tác ngay; cancel hoàn tất; ca và khung giờ còn nguyên; INV`, async () => {
    const w = await world();
    const repo = new ShiftRemovalRepository(db);
    const shift = {
      lichLamViecId: w.shift.lichLamViecId,
      bacSiId: w.doctor.profile.taiKhoanId,
    };
    await runRounds({
      rounds: ROUNDS,
      setup: async () => ({
        lich: await freshAppointment(w, 'DaXacNhan'),
        stack: createCancelStack(db),
      }),
      race: ({ lich, stack }, round) => {
        const gate = createGate(2);
        // vòng chẵn: cancel đi trước; vòng lẻ: gỡ ca đi trước (chênh vài mili giây, vẫn chồng lên nhau)
        return [
          async (): Promise<unknown> => {
            await gate.arrive();
            if (round % 2 === 1) await sleep(4);
            return stack.service.cancel(
              cancelInput(w, 'BenhNhan', lich.maLichHen),
            );
          },
          async (): Promise<unknown> => {
            await gate.arrive();
            if (round % 2 === 0) await sleep(4);
            return removeShiftLikeDoctor(repo, shift);
          },
        ] as const;
      },
      check: async (_context, results) => {
        const [cancelled, removed] = results;
        expect(cancelled?.status).toBe('fulfilled');
        if (cancelled?.status === 'fulfilled')
          expect((cancelled.value as CancelOutcome).kind).toBe('Cancelled');
        expect(removed?.status).toBe('rejected');
        for (const result of results) {
          if (result.status !== 'rejected') continue;
          expect(isDeadlockError(result.reason)).toBe(false);
          expect(isLockWaitTimeoutError(result.reason)).toBe(false);
        }
        if (removed?.status === 'rejected')
          expect(isForeignKeyError(removed.reason)).toBe(true);
        // gỡ ca bị hoàn tác: ca và đủ 8 khung giờ còn nguyên
        const [{ slots }] = await db.query<{ slots: string | number }[]>(
          'SELECT COUNT(*) AS slots FROM khung_gio WHERE lich_lam_viec_id = ?',
          [shift.lichLamViecId],
        );
        expect(Number(slots)).toBe(w.slotIds.length);
        const [{ shifts }] = await db.query<{ shifts: string | number }[]>(
          'SELECT COUNT(*) AS shifts FROM lich_lam_viec WHERE lich_lam_viec_id = ?',
          [shift.lichLamViecId],
        );
        expect(Number(shifts)).toBe(1);
        await assertBookingInvariants(db);
      },
    });
  });
});

describe('DT-07 hai huỷ cùng lúc (Bệnh nhân và Lễ tân), cùng bộ cổng (≥ 30 vòng)', () => {
  it(`${String(ROUNDS)} vòng: một Cancelled và một AlreadyCancelled; hoàn tiền, mời danh sách chờ và thông báo đúng MỘT lần; không deadlock; INV`, async () => {
    const w = await world();
    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        const lich = await freshAppointment(w, 'DaXacNhan');
        const ports = createFakePorts();
        ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });
        return { lich, ports };
      },
      race: ({ lich, ports }) => {
        const gate = createGate(2);
        // hai "bản API" cùng đếm vào MỘT bộ cổng
        const first = createCancelStack(db, ports).service;
        const second = createCancelStack(db, ports).service;
        return [
          async () => {
            await gate.arrive();
            return first.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen));
          },
          async () => {
            await gate.arrive();
            return second.cancel(cancelInput(w, 'LeTan', lich.maLichHen));
          },
        ];
      },
      check: async ({ lich, ports }, results) => {
        const kinds = valuesOf(results)
          .map((outcome) => outcome.kind)
          .sort();
        expect(kinds).toEqual(['AlreadyCancelled', 'Cancelled']);
        expect(ports.refund.refundCall.count).toBe(1);
        expect(ports.waitlist.onSlotReleasedCall.count).toBe(1);
        expect(ports.notifier.notifyCall.count).toBe(1);
        expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
          'DaHuy',
        );
        await assertBookingInvariants(db);
      },
    });
  });
});

describe('DT-05, DT-06 (một phần B10) huỷ cùng lúc tiếp đón hay job Vắng mặt (≥ 30 vòng)', () => {
  it.each([
    ['DT-05 tiếp đón (DaXacNhan → DaTiepDon)', 'DaTiepDon'],
    ['DT-06 job Vắng mặt (DaXacNhan → VangMat)', 'VangMat'],
  ] as const)(
    '%s: đúng MỘT bên thắng; huỷ thắng ⇒ DaHuy và khung giờ ConTrong, bên kia thấy trạng thái đã đổi; bên kia thắng ⇒ huỷ nhận NotCancellable, khung giờ giữ DaDat (không giải phóng sai, không mời chờ)',
    async (_name, to) => {
      const w = await world();
      await runRounds({
        rounds: ROUNDS,
        setup: async () => ({
          lich: await freshAppointment(w, 'DaXacNhan'),
          ports: createFakePorts(),
        }),
        race: ({ lich, ports }) => {
          const gate = createGate(2);
          const stack = createCancelStack(db, ports);
          return [
            async (): Promise<CancelOutcome | 'Changed' | 'Stale'> => {
              await gate.arrive();
              return stack.service.cancel(
                cancelInput(w, 'BenhNhan', lich.maLichHen),
              );
            },
            async (): Promise<CancelOutcome | 'Changed' | 'Stale'> => {
              await gate.arrive();
              return changeStatusLikeStaff(db, {
                lichHenId: lich.lichHenId,
                khungGioId: w.slotId(0),
                from: 'DaXacNhan',
                to,
              });
            },
          ];
        },
        check: async ({ lich, ports }, results) => {
          const [cancelResult, staffResult] = valuesOf(results);
          const state = await readAppointment(db, lich.lichHenId);
          const slot = await w.slotState(0);
          if (staffResult === 'Changed') {
            expect(cancelResult).toStrictEqual({
              kind: 'NotCancellable',
              trangThai: to,
            });
            expect(state.trangThai).toBe(to);
            expect(slot).toEqual({ trangThai: 'DaDat', giuChoDen: null });
            expect(ports.waitlist.onSlotReleasedCall.count).toBe(0);
            expect(ports.refund.refundCall.count).toBe(0);
          } else {
            expect(staffResult).toBe('Stale');
            expect(cancelResult).toMatchObject({ kind: 'Cancelled' });
            expect(state.trangThai).toBe('DaHuy');
            expect(slot).toEqual({ trangThai: 'ConTrong', giuChoDen: null });
            expect(ports.waitlist.onSlotReleasedCall.count).toBe(1);
          }
          await assertBookingInvariants(db);
        },
      });
    },
  );
});

describe('DT-08 job hết hạn cùng lúc Bệnh nhân huỷ (phần cancel thật; ≥ 30 vòng)', () => {
  it(`${String(ROUNDS)} vòng: một bên thắng (Expired hay Cancelled), bên kia thấy lịch đã DaHuy; WaitlistPort đúng MỘT lần cho cả hai; không hoàn, không Failed; INV`, async () => {
    const w = await world();
    // đồng hồ ứng dụng = giờ của lượt hết hạn (09:00 ngày 02/11, sau hạn 08:15 của lịch ChoThanhToan): `cancel` đọc đồng hồ này, `expire` nhận `now` tường minh
    vi.setSystemTime(FLOW_NOW);
    await runRounds({
      rounds: ROUNDS,
      setup: async () => ({
        lich: await freshAppointment(w, 'ChoThanhToan'),
        ports: createFakePorts(),
      }),
      race: ({ lich, ports }) => {
        const gate = createGate(2);
        const cancelStack = createCancelStack(db, ports);
        const expiry = createExpiryStack(db, ports.waitlist);
        return [
          async (): Promise<unknown> => {
            await gate.arrive();
            return cancelStack.service.cancel(
              cancelInput(w, 'BenhNhan', lich.maLichHen),
            );
          },
          async (): Promise<unknown> => {
            await gate.arrive();
            return expiry.service.expire({
              lichHenId: lich.lichHenId,
              now: FLOW_NOW,
            });
          },
        ];
      },
      check: async ({ lich, ports }, results) => {
        const [cancelResult, expireResult] = valuesOf(results) as [
          CancelOutcome,
          ExpireOutcome,
        ];
        const state = await readAppointment(db, lich.lichHenId);
        expect(state.trangThai).toBe('DaHuy');
        const cancelledByPatient = cancelResult.kind === 'Cancelled';
        if (cancelledByPatient) {
          expect(expireResult).toEqual({
            kind: 'NotDue',
            reason: 'NotPending',
          });
          expect(state.lyDo).toBe(PATIENT_CANCEL_REASON);
        } else {
          expect(cancelResult).toStrictEqual({ kind: 'AlreadyCancelled' });
          expect(expireResult).toMatchObject({ kind: 'Expired' });
          expect(state.lyDo).toBe(HOLD_EXPIRED_CANCEL_REASON);
        }
        expect(ports.waitlist.onSlotReleasedCall.count).toBe(1);
        expect(ports.refund.refundCall.count).toBe(0);
        await assertBookingInvariants(db);
      },
    });
  });
});
