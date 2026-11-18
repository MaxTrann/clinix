import type { DataSource } from 'typeorm';
import { BookingFixtures } from '../../appointments/testing/booking-fixtures.js';
import { createAppointmentWorld } from '../../appointments/testing/create-appointment-world.js';
import {
  createGate,
  runRounds,
} from '../../appointments/testing/concurrency-harness.js';
import {
  reportRounds,
  sleep,
  winnerTally,
} from '../../appointments/testing/concurrency-report.js';
import { createCancelStack } from '../../appointments/testing/cancel-world.js';
import { assertBookingInvariants } from '../../appointments/testing/invariants.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { WalletFixtures } from '../../wallet/testing/wallet-fixtures.js';
import { assertWalletInvariants } from '../../wallet/testing/wallet-invariants.js';
import { AppException } from '../../common/errors/app.exception.js';
import { withdrawalStack } from '../../wallet/testing/withdrawal-stack.js';
import { PaymentRecorder } from '../ports/payment-recorder.js';
import { depositStack } from '../testing/deposit-stack.js';
import { paymentWorld } from '../testing/payment-world.js';

// payment B5 — thanh toán cọc bằng ví ĐỒNG THỜI trên MySQL 8.4 THẬT (PLAN payment 5.3, 5.15; DTT-01…DTT-06; M1, M2, M4, M7). Mỗi vòng dựng dữ liệu MỚI, các bên cùng xuất phát qua `createGate`,
// rồi kiểm KẾT QUẢ và bất biến của booking (INV) lẫn của ví (IVT). Mọi yêu cầu qua `withBookingTransaction` thật (READ COMMITTED, thử lại ≤ 2, chờ khoá ≤ 3 giây): "0 deadlock" nghĩa là KHÔNG 1213 hay 1205 nào
// còn sót, không lỗi lạ (sẽ thành 500 ở HTTP). CHẠY MỘT MÌNH (nhạy với tải máy). Số vòng ở `ROUNDS` ít hơn 300 của PLAN ở DTT-04 và DTT-06 (ghi ở TRACKING); `[đề xuất]` tăng lên khi chạy trên máy rảnh.
// DTT-04: bên rút là `WithdrawalService` THẬT của B11 (trước B11 là giao dịch giả đi đúng chuỗi đó; chạy lại ở B11, 18/11/2026).
const ROUNDS = 30;
/**
 * Bên "nhanh" (expire, cancel, rút) trễ thêm `(vòng − 1) × STAGGER_MS` sau cổng xuất phát: thanh toán có vài câu đọc trước khi vào giao dịch nên nếu hai bên xuất phát cùng lúc thì bên nhanh LUÔN thắng
 * và ca không thật sự đua. Quét độ lệch 0…58 ms để cả hai thứ tự thắng đều xảy ra (số liệu ở dòng `[B5-DTT]`).
 */
const STAGGER_MS = 2;
const lag = (round: number) => sleep((round - 1) * STAGGER_MS);
/** Kết quả một bên của DTT-04 (hai bên trả hai kiểu khác nhau) */
interface Raced {
  who: 'pay' | 'withdraw';
  value: unknown;
}
const COC = '100000.00';
const PAST_HOLD = new Date('2026-11-02T10:00:00+07:00'); // sau han_thanh_toan mặc định (08:15) của fixture

let db: DataSource;
let fx: BookingFixtures;
let wf: WalletFixtures;
let logs: string[] = [];
useIntegrationHooks((d, captured) => {
  db = d;
  fx = new BookingFixtures(d);
  wf = new WalletFixtures(d);
  logs = captured;
});

const report = (name: string, winners: Record<string, number>): void => {
  reportRounds('B5-DTT', name, ROUNDS, winners, logs);
};

async function settled() {
  await assertBookingInvariants(db);
  await assertWalletInvariants(db);
}

/** Số lần cọc đã trừ khỏi MỘT ví: số dòng sổ cái `ThanhToan` của ví đó (mỗi vòng có ví mới nên các vòng không lẫn nhau). */
const debits = async (walletId: string) =>
  Number(
    (
      await db.query<{ n: string }[]>(
        `SELECT COUNT(*) AS n FROM giao_dich_vi WHERE vi_noi_bo_id = ? AND loai = 'ThanhToan'`,
        [walletId],
      )
    )[0]!.n,
  );
const stateOf = async (lichHenId: string) =>
  (
    await db.query<{ trangThai: string }[]>(
      'SELECT trang_thai AS trangThai FROM lich_hen WHERE lich_hen_id = ?',
      [lichHenId],
    )
  )[0]!.trangThai;

/** Chỉ chấp nhận kết quả "từ chối nghiệp vụ" (AppException) hay thành công: 1213, 1205 và lỗi lạ làm ca đỏ. */
function expectNoContention(results: PromiseSettledResult<unknown>[]): void {
  for (const result of results)
    if (result.status === 'rejected') {
      const code = (result.reason as { maLoi?: string }).maLoi;
      expect(code, String(result.reason)).toBeDefined();
      expect(code).not.toBe('HE_THONG_DANG_BAN');
    }
}

describe('DTT-03 hai thanh toán cọc cùng lịch (hai tab)', () => {
  it(`${String(ROUNDS)} vòng: trừ MỘT lần; một bên daXuLyTruocDo false, bên kia true; không 1213, không lỗi lạ`, async () => {
    const winners = winnerTally();
    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        const w = await paymentWorld(db);
        await wf.fundWallet(w.patient.wallet.viNoiBoId, '350000.00');
        return { w, lich: await w.appointment(0) };
      },
      race: ({ w, lich }) => {
        const gate = createGate(2);
        const service = depositStack(db).service;
        return [0, 1].map(() => async () => {
          await gate.arrive();
          return service.pay(w.patientId, lich.maLichHen);
        });
      },
      check: async ({ w, lich }, results) => {
        expectNoContention(results);
        const ok = results.flatMap((r) =>
          r.status === 'fulfilled' ? [r.value] : [],
        );
        expect(ok.length).toBeGreaterThanOrEqual(1);
        expect(ok.filter((r) => !r.daXuLyTruocDo)).toHaveLength(1);
        expect(await debits(w.patient.wallet.viNoiBoId)).toBe(1);
        expect(await stateOf(lich.lichHenId)).toBe('DaXacNhan');
        expect(await wf.readWallet(w.patient.wallet.viNoiBoId)).toMatchObject({
          soDu: '250000.00',
        });
        await settled();
        winners.add(ok.length === 2 ? 'cả hai 200' : 'một 200');
      },
    });
    report('DTT-03', winners.winners);
  });
});

describe('DTT-01 ★ thanh toán cọc đua expire cùng lịch', () => {
  it(`${String(ROUNDS)} vòng: MỘT nhánh thắng; thanh toán thắng ⇒ DaXacNhan và ví trừ; expire thắng ⇒ DaHuy, HET_HAN_GIU_CHO và ví nguyên; INV và IVT giữ`, async () => {
    const winners = winnerTally();
    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        const w = await paymentWorld(db);
        await wf.fundWallet(w.patient.wallet.viNoiBoId, '350000.00');
        return { w, lich: await w.appointment(0), stack: depositStack(db) };
      },
      race: ({ w, lich, stack }, round) => {
        const gate = createGate(2);
        return [
          async (): Promise<unknown> => {
            await gate.arrive();
            return stack.service.pay(w.patientId, lich.maLichHen);
          },
          async (): Promise<unknown> => {
            await gate.arrive();
            await lag(round);
            return stack.transitions.expire({
              lichHenId: lich.lichHenId,
              now: PAST_HOLD,
            });
          },
        ];
      },
      check: async ({ w, lich }, results) => {
        expectNoContention(results);
        const state = await stateOf(lich.lichHenId);
        const balance = await wf.readWallet(w.patient.wallet.viNoiBoId);
        if (state === 'DaXacNhan') {
          expect(await debits(w.patient.wallet.viNoiBoId)).toBe(1);
          expect(balance.soDu).toBe('250000.00');
          winners.add('thanh toán thắng');
        } else {
          expect(state).toBe('DaHuy');
          expect(await debits(w.patient.wallet.viNoiBoId)).toBe(0);
          expect(balance.soDu).toBe('350000.00');
          winners.add('expire thắng');
        }
        await settled();
      },
    });
    report('DTT-01', winners.winners);
  });
});

describe('DTT-02 thanh toán cọc đua huỷ của Bệnh nhân', () => {
  it(`${String(ROUNDS)} vòng: không 1213 hay lỗi lạ; lịch DaXacNhan hay DaHuy; số lần trừ khớp số dòng thanh toán; INV và IVT giữ`, async () => {
    const winners = winnerTally();
    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        const w = await paymentWorld(db);
        await wf.fundWallet(w.patient.wallet.viNoiBoId, '350000.00');
        return {
          w,
          lich: await w.appointment(0),
          stack: depositStack(db),
          cancel: createCancelStack(db),
        };
      },
      race: ({ w, lich, stack, cancel }, round) => {
        const gate = createGate(2);
        return [
          async (): Promise<unknown> => {
            await gate.arrive();
            return stack.service.pay(w.patientId, lich.maLichHen);
          },
          async (): Promise<unknown> => {
            await gate.arrive();
            await lag(round);
            return cancel.service.cancel({
              maLichHen: lich.maLichHen,
              actor: { kind: 'BenhNhan', accountId: w.patientId },
              reason: 'BenhNhanHuy',
            });
          },
        ];
      },
      check: async ({ w, lich }, results) => {
        expectNoContention(results);
        const state = await stateOf(lich.lichHenId);
        expect(['DaXacNhan', 'DaHuy']).toContain(state);
        const paid = await debits(w.patient.wallet.viNoiBoId);
        const paymentRows = Number(
          (
            await db.query<{ n: string }[]>(
              `SELECT COUNT(*) AS n FROM giao_dich_thanh_toan WHERE vi_noi_bo_id = ? AND loai = 'ThanhToanLichHen' AND trang_thai = 'ThanhCong'`,
              [w.patient.wallet.viNoiBoId],
            )
          )[0]!.n,
        );
        expect(paymentRows).toBe(paid);
        expect(paid).toBeLessThanOrEqual(1);
        await settled();
        winners.add(`${state}, trừ ${String(paid)} lần`);
      },
    });
    report('DTT-02', winners.winners);
  });
});

describe('DTT-04 ★ thanh toán cọc đua rút tiền cùng số dư', () => {
  it(`${String(ROUNDS)} vòng: ví đủ cho MỘT trong hai; đúng một bên thắng; ví không âm; không 500`, async () => {
    const winners = winnerTally();
    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        const w = await paymentWorld(db);
        await wf.fundWallet(w.patient.wallet.viNoiBoId, COC);
        return { w, lich: await w.appointment(0), stack: depositStack(db) };
      },
      race: ({ w, lich, stack }, round) => {
        const gate = createGate(2);
        const withdrawals = withdrawalStack(db);
        return [
          async (): Promise<Raced> => {
            await gate.arrive();
            return {
              who: 'pay',
              value: await stack.service.pay(w.patientId, lich.maLichHen),
            };
          },
          async (): Promise<Raced> => {
            await gate.arrive();
            await lag(round);
            // B11 THẬT (thay giao dịch giả của B5): `WithdrawalService.request` khoá ví (7b), kiểm và giữ đúng số dưới khoá, ghi yêu cầu `ChoDuyet`; thiếu tiền ⇒ 409 SO_DU_KHONG_DU
            const held = await withdrawals
              .request(w.patientId, '100000')
              .then(() => true)
              .catch((error: unknown) => {
                if (
                  error instanceof AppException &&
                  error.maLoi === 'SO_DU_KHONG_DU'
                )
                  return false;
                throw error;
              });
            return { who: 'withdraw', value: held };
          },
        ];
      },
      check: async ({ w, lich }, results) => {
        expectNoContention(results);
        const paid = (await stateOf(lich.lichHenId)) === 'DaXacNhan';
        const withdrew = results.some(
          (r) =>
            r.status === 'fulfilled' &&
            r.value.who === 'withdraw' &&
            r.value.value === true,
        );
        // Số dư đúng bằng một cọc: chỉ MỘT bên có tiền
        expect(Number(paid) + Number(withdrew)).toBe(1);
        const wallet = await wf.readWallet(w.patient.wallet.viNoiBoId);
        expect(Number(wallet.soDu)).toBeGreaterThanOrEqual(0);
        expect(
          Number(wallet.soDu) - Number(wallet.soTienDangGiu),
        ).toBeGreaterThanOrEqual(0);
        await settled();
        winners.add(paid ? 'thanh toán thắng' : 'rút thắng');
      },
    });
    report('DTT-04', winners.winners);
  });
});

describe('DTT-05 hai thanh toán cọc hai lịch KHÁC nhau cùng Bệnh nhân', () => {
  it(`${String(ROUNDS)} vòng: tuần tự qua ví; cả hai thành công; ví trừ hai cọc; không 1213 vượt thử lại`, async () => {
    const winners = winnerTally();
    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        const w = await paymentWorld(db);
        await wf.fundWallet(w.patient.wallet.viNoiBoId, '350000.00');
        return {
          w,
          a: await w.appointment(0),
          b: await w.appointment(1),
          stack: depositStack(db),
        };
      },
      race: ({ w, a, b, stack }) => {
        const gate = createGate(2);
        return [a, b].map((lich) => async () => {
          await gate.arrive();
          return stack.service.pay(w.patientId, lich.maLichHen);
        });
      },
      check: async ({ w, a, b }, results) => {
        expectNoContention(results);
        expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
        expect(await stateOf(a.lichHenId)).toBe('DaXacNhan');
        expect(await stateOf(b.lichHenId)).toBe('DaXacNhan');
        expect(await wf.readWallet(w.patient.wallet.viNoiBoId)).toMatchObject({
          soDu: '150000.00',
        });
        await settled();
        winners.add('cả hai thành công');
      },
    });
    report('DTT-05', winners.winners);
  });
});

describe('DTT-06 ★ create cọc 0đ đua thanh toán cọc ví của lịch KHÁC cùng Bệnh nhân (M1)', () => {
  it(`${String(ROUNDS)} vòng: không 1213 vượt thử lại, kết quả đúng: lịch mới có một dòng 0đ, lịch kia DaXacNhan và ví trừ một cọc`, async () => {
    const winners = winnerTally();
    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        const w = await createAppointmentWorld(db, fx, {
          payment: new PaymentRecorder(),
        });
        await wf.fundWallet(w.patient.wallet.viNoiBoId, '350000.00');
        const pending = await fx.appointmentIn('ChoThanhToan', {
          doctor: w.doctor.profile,
          khungGioId: w.slot(1),
          patientId: w.patientId,
          tienCocSnapshot: COC,
        });
        return { w, pending, stack: depositStack(db) };
      },
      race: ({ w, pending, stack }) => {
        const gate = createGate(2);
        return [
          async (): Promise<unknown> => {
            await gate.arrive();
            return stack.service.pay(w.patientId, pending.maLichHen);
          },
          async (): Promise<unknown> => {
            await gate.arrive();
            return w.create(0);
          },
        ];
      },
      check: async ({ w, pending }, results) => {
        expectNoContention(results);
        expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
        expect(await stateOf(pending.lichHenId)).toBe('DaXacNhan');
        expect(await debits(w.patient.wallet.viNoiBoId)).toBe(1);
        const zero = Number(
          (
            await db.query<{ n: string }[]>(
              `SELECT COUNT(*) AS n FROM giao_dich_thanh_toan WHERE vi_noi_bo_id = ? AND so_tien = 0 AND phuong_thuc = 'Vi'`,
              [w.patient.wallet.viNoiBoId],
            )
          )[0]!.n,
        );
        expect(zero).toBe(1);
        expect(await wf.readWallet(w.patient.wallet.viNoiBoId)).toMatchObject({
          soDu: '250000.00',
        });
        await settled();
        winners.add('cả hai thành công');
      },
    });
    report('DTT-06', winners.winners);
  });
});
