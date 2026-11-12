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
let logs: string[] = [];
useIntegrationHooks((d, captured) => {
  db = d;
  fx = new BookingFixtures(d);
  logs = captured;
});
const world = () => cancelWorld(db, fx);

// BỘ ĐẾM (yêu cầu của Đại 12/11/2026; ban đầu CHỈ báo số thật, 0 cũng báo; từ giai đoạn 3 thêm khẳng định `thử lại = 0`, xem `report`): `withBookingTransaction` ghi một cảnh báo mỗi lần thử lại hay hết lượt
// (`<nhãn>: MySQL 1213|1205 ở lần chạy n/3, thử lại|hết lượt thử lại`); `useIntegrationHooks` đã gom mọi dòng Logger của Nest từ đầu test vào `logs`.
const RETRY_WARNING =
  /^(\S+): MySQL (1213|1205) ở lần chạy \d+\/\d+, (thử lại|hết lượt thử lại)$/;

/** Số lần thử lại theo `nhãn + mã lỗi` và số lần hết lượt (503), từ đầu test tới giờ. */
function retryStats(): { retries: Record<string, number>; exhausted: number } {
  const retries: Record<string, number> = {};
  let exhausted = 0;
  for (const line of logs) {
    const match = RETRY_WARNING.exec(line);
    if (match === null) continue;
    if (match[3] === 'hết lượt thử lại') exhausted += 1;
    else {
      const key = `${match[1] ?? '?'} MySQL ${match[2] ?? '?'}`;
      retries[key] = (retries[key] ?? 0) + 1;
    }
  }
  return { retries, exhausted };
}

/** Bên thắng mỗi vòng: tăng bộ đếm theo nhãn. */
function winnerTally() {
  const winners: Record<string, number> = {};
  return {
    winners,
    add: (label: string) => {
      winners[label] = (winners[label] ?? 0) + 1;
    },
  };
}

/** In MỘT dòng số liệu của ca (vào log của vitest, tiền tố `[B10-DT]`); báo cáo giai đoạn 2 lấy số ở đây. */
function report(
  name: string,
  rounds: number,
  winners: Record<string, number>,
): void {
  const { retries, exhausted } = retryStats();
  const total = Object.values(retries).reduce((sum, n) => sum + n, 0);
  console.info(
    `[B10-DT] ${name}: ${String(rounds)} vòng; bên thắng ${JSON.stringify(winners)}; thử lại ${JSON.stringify(retries)} (tổng ${String(total)}); hết lượt (503) ${String(exhausted)}`,
  );
  // TĂNG CƯỜNG sau đột biến M2 (giai đoạn 3, 12/11/2026): đảo thứ tự khoá cho 10 đến 40 lần 1213 mỗi ca mà ca vẫn XANH vì `withBookingTransaction` thử lại và chạy lại thân. Với thứ tự khoá đúng
  // (5.3: khung_gio rồi lich_hen theo khoá chính) không có deadlock nào, kể cả trước khi thử lại: đo 0 ở mọi lượt chạy trước khi thêm dòng này. Số khác 0 là THỨ TỰ KHOÁ SAI, không phải nhiễu.
  expect(
    total,
    `${name}: có ${String(total)} lần thử lại 1213/1205 ${JSON.stringify(retries)}`,
  ).toBe(0);
  expect(exhausted, `${name}: có yêu cầu hết lượt thử lại (503)`).toBe(0);
}

/** Vị trí 1451 của gỡ ca: câu `DELETE khung_gio` vướng `lich_hen` (cancel đã xong trước, khung giờ đã ConTrong) hay `DELETE lich_lam_viec` vướng `khung_gio` (gỡ ca giữ khoá trước, khung giờ còn DaDat). */
function blockedAt(reason: unknown): string {
  const driver = (reason as { driverError?: { sqlMessage?: string } })
    .driverError;
  const text =
    driver?.sqlMessage ?? (reason instanceof Error ? reason.message : '');
  return text.includes('`lich_hen`')
    ? 'cancel xong trước (1451 ở DELETE khung_gio)'
    : 'gỡ ca giữ khoá trước (1451 ở DELETE lich_lam_viec)';
}

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
    const tally = winnerTally();
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
        if (removed?.status === 'rejected') {
          expect(isForeignKeyError(removed.reason)).toBe(true);
          tally.add(blockedAt(removed.reason));
        }
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
    report('HL-18', ROUNDS, tally.winners);
  });
});

describe('DT-07 hai huỷ cùng lúc (Bệnh nhân và Lễ tân), cùng bộ cổng (≥ 30 vòng)', () => {
  it(`${String(ROUNDS)} vòng: một Cancelled và một AlreadyCancelled; hoàn tiền, mời danh sách chờ và thông báo đúng MỘT lần; không deadlock; INV`, async () => {
    const w = await world();
    const tally = winnerTally();
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
        const outcomes = valuesOf(results);
        const kinds = outcomes.map((outcome) => outcome.kind).sort();
        expect(kinds).toEqual(['AlreadyCancelled', 'Cancelled']);
        // kết quả giữ đúng thứ tự tác vụ: [0] Bệnh nhân, [1] Lễ tân
        tally.add(outcomes[0]?.kind === 'Cancelled' ? 'Bệnh nhân' : 'Lễ tân');
        expect(ports.refund.refundCall.count).toBe(1);
        expect(ports.waitlist.onSlotReleasedCall.count).toBe(1);
        expect(ports.notifier.notifyCall.count).toBe(1);
        expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
          'DaHuy',
        );
        await assertBookingInvariants(db);
      },
    });
    report('DT-07', ROUNDS, tally.winners);
  });
});

describe('DT-05, DT-06 (một phần B10) huỷ cùng lúc tiếp đón hay job Vắng mặt (≥ 30 vòng)', () => {
  it.each([
    ['DT-05 tiếp đón (DaXacNhan → DaTiepDon)', 'DaTiepDon'],
    ['DT-06 job Vắng mặt (DaXacNhan → VangMat)', 'VangMat'],
  ] as const)(
    '%s: đúng MỘT bên thắng; huỷ thắng ⇒ DaHuy và khung giờ ConTrong, bên kia thấy trạng thái đã đổi; bên kia thắng ⇒ huỷ nhận NotCancellable, khung giờ giữ DaDat (không giải phóng sai, không mời chờ)',
    async (name, to) => {
      const w = await world();
      const tally = winnerTally();
      await runRounds({
        rounds: ROUNDS,
        setup: async () => ({
          lich: await freshAppointment(w, 'DaXacNhan'),
          ports: createFakePorts(),
        }),
        race: ({ lich, ports }, round) => {
          const gate = createGate(2);
          const stack = createCancelStack(db, ports);
          // Lần chạy đầu (12/11/2026) đo 40/40 vòng bên tiếp đón thắng: `cancel` đọc thường trước khi mở giao dịch nên luôn đến khoá sau. Vòng lẻ: tiếp đón chờ vài mili giây để huỷ đi trước
          // (nhánh "huỷ thắng" được chạy THẬT); vòng chẵn: không chờ (nhánh "bên kia thắng"). Không đổi kỳ vọng nào.
          return [
            async (): Promise<CancelOutcome | 'Changed' | 'Stale'> => {
              await gate.arrive();
              return stack.service.cancel(
                cancelInput(w, 'BenhNhan', lich.maLichHen),
              );
            },
            async (): Promise<CancelOutcome | 'Changed' | 'Stale'> => {
              await gate.arrive();
              if (round % 2 === 1) await sleep(8);
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
          tally.add(
            staffResult === 'Changed'
              ? 'tiếp đón hoặc job Vắng mặt thắng'
              : 'huỷ thắng',
          );
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
      report(name.slice(0, 5), ROUNDS, tally.winners);
    },
  );
});

describe('DT-08 job hết hạn cùng lúc Bệnh nhân huỷ (phần cancel thật; ≥ 30 vòng)', () => {
  it(`${String(ROUNDS)} vòng: một bên thắng (Expired hay Cancelled), bên kia thấy lịch đã DaHuy; WaitlistPort đúng MỘT lần cho cả hai; không hoàn, không Failed; INV`, async () => {
    const w = await world();
    // đồng hồ ứng dụng = giờ của lượt hết hạn (09:00 ngày 02/11, sau hạn 08:15 của lịch ChoThanhToan): `cancel` đọc đồng hồ này, `expire` nhận `now` tường minh
    vi.setSystemTime(FLOW_NOW);
    const tally = winnerTally();
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
        tally.add(
          cancelledByPatient ? 'Bệnh nhân huỷ thắng' : 'job hết hạn thắng',
        );
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
    report('DT-08', ROUNDS, tally.winners);
  });
});
