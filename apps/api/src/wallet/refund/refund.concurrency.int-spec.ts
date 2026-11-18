import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { withBookingTransaction } from '../../appointments/locking/booking-transaction.js';
import { SlotHoldService } from '../../appointments/slots/slot-hold.service.js';
import { AppointmentTransitionService } from '../../appointments/state/appointment-transition.service.js';
import { BookingFixtures } from '../../appointments/testing/booking-fixtures.js';
import {
  createGate,
  runRounds,
  tallyOutcomes,
} from '../../appointments/testing/concurrency-harness.js';
import {
  FakeAppointmentNotifier,
  FakeWaitlistPort,
} from '../../appointments/testing/fake-ports.js';
import { assertBookingInvariants } from '../../appointments/testing/invariants.js';
import {
  checkInInput,
  noShowInput,
  runCheckIn,
  runNoShow,
  statusWorld,
} from '../../appointments/testing/status-world.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { PaymentChain } from '../../payment/ports/payment-chain.js';
import { paymentWorld } from '../../payment/testing/payment-world.js';
import { WalletLedger } from '../ledger/wallet-ledger.js';
import { assertWalletInvariants } from '../testing/wallet-invariants.js';
import { WalletFixtures } from '../testing/wallet-fixtures.js';
import { RefundNotifier } from './refund-notifier.js';
import { RefundRetryJob } from './refund-retry.job.js';
import { RefundRepository } from './refund.queries.js';
import { RefundService } from './refund.service.js';

// payment B8 — ca ĐỒNG THỜI và số đo của hoàn cọc tự động trên MySQL 8.4 THẬT (PLAN payment 5.3, 5.15, 7.x): HCC-11 và DTT-13 (hai `refund` cùng khoản), M2 (hai hoàn cọc cùng ví: thứ tự khoá đúng thì 0 lần 1213),
// M14 (hai bản `RefundRetryJob` chạy cùng lúc không thử trùng), DTT-16 (hoàn cọc đua với `confirmPaid`, `checkIn`, `markNoShow` trên CÙNG lịch: không 1213 lộ ra ngoài; thấy 1213 lộ ra thì quay về
// thông báo KHÔNG gắn `lich_hen_id`, 4.7 #8). Mỗi vòng dựng lại dữ liệu, các bên xuất phát qua một cổng (`createGate`). Ca NHẠY VỚI TẢI: chạy MỘT MÌNH trên MySQL. Dữ liệu giả.
const ROUNDS = 40;
const TIMEOUT = 600_000;
const MIN = 60_000;
const T0 = new Date('2026-11-02T01:00:00.000Z');

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const sleepMs = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Các việc cùng xuất phát qua một cổng; việc thứ i trễ `delays[i]` ms (xen kẽ thứ tự giữa các vòng). */
const together = <T>(
  tasks: readonly (() => Promise<T>)[],
  delays: readonly number[] = [],
) => {
  const gate = createGate(tasks.length);
  return tasks.map((task, index) => async () => {
    await gate.arrive();
    if ((delays[index] ?? 0) > 0) await sleepMs(delays[index]!);
    return task();
  });
};

/** Đếm số lần `withBookingTransaction` ĐÃ thử lại vì 1213 hay 1205 (cảnh báo của chính nó); không đổi hành vi. Số này ghi ra cho M2 và DTT-16: thứ tự khoá đúng thì phải là 0. */
function watchRetries() {
  const messages: string[] = [];
  vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
    if (typeof message === 'string' && /MySQL (1213|1205)/.test(message))
      messages.push(message);
  });
  return () => messages.length;
}

/** Xoá mọi dữ liệu tiền và lịch của vòng trước (theo thứ tự khoá ngoại: sổ cái → dòng hoàn → thanh toán → thông báo → lịch). */
async function resetMoneyAndAppointments() {
  for (const table of [
    'giao_dich_vi',
    'lich_su_hoan_tien',
    'giao_dich_thanh_toan',
    'thong_bao',
    'lich_hen',
  ])
    await db.query(`DELETE FROM ${table}`);
  await db.query(
    "UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL",
  );
}

function build() {
  const repository = new RefundRepository();
  const ledger = new WalletLedger();
  const service = new RefundService(
    db,
    repository,
    ledger,
    new PaymentChain(),
    new RefundNotifier(),
  );
  return { repository, ledger, service };
}

async function refundWorld(slots: number) {
  const w = await paymentWorld(db);
  const wallets = new WalletFixtures(db);
  const walletId = w.patient.wallet.viNoiBoId;
  const { service, repository, ledger } = build();
  /** Dựng `slots` lịch đã huỷ, mỗi lịch có khoản cọc 100.000đ qua ví; ví về 0đ. Trả lịch và khoản thanh toán của từng lịch. */
  const setup = async () => {
    await resetMoneyAndAppointments();
    await wallets.setWallet(walletId, '0.00');
    const result: { lichHenId: string; paymentId: string }[] = [];
    for (let slot = 0; slot < slots; slot += 1) {
      const lich = await w.appointment(slot, {
        trangThai: 'DaHuy',
        coc: '100000.00',
      });
      result.push({
        lichHenId: lich.lichHenId,
        paymentId: await wallets.insertWalletDeposit({
          viNoiBoId: walletId,
          lichHenId: lich.lichHenId,
          soTien: '100000.00',
        }),
      });
    }
    return result;
  };
  return { w, wallets, walletId, service, repository, ledger, setup };
}

const successRows = (paymentId: string) =>
  db.query(
    "SELECT so_lan_thu AS soLanThu FROM lich_su_hoan_tien WHERE giao_dich_thanh_toan_id = ? AND trang_thai = 'ThanhCong'",
    [paymentId],
  ) as Promise<{ soLanThu: number }[]>;

describe('HCC-11, DTT-13 hai (ba) refund đồng thời cùng một khoản (40 vòng)', () => {
  it(
    'MỘT lần cộng duy nhất (khoá 7a; UNIQUE (khoản, so_lan_thu) là lưới thứ hai); mọi lời gọi đều Refunded; một dòng hoàn, một dòng sổ cái, một thông báo; bất biến ví giữ; 0 deadlock, 0 hết giờ chờ khoá',
    async () => {
      const x = await refundWorld(1);
      const retries = watchRetries();
      const all = await runRounds({
        rounds: ROUNDS,
        setup: x.setup,
        race: ([lich], round) =>
          together(
            Array.from(
              { length: 3 },
              () => () =>
                x.service.refund({
                  lichHenId: lich!.lichHenId,
                  soTien: '50000.00',
                  lyDo: 'Huỷ',
                }),
            ),
            [0, round % 3, (round + 1) % 3],
          ),
        check: async ([lich], results) => {
          for (const result of results)
            expect(result).toMatchObject({
              status: 'fulfilled',
              value: { kind: 'Refunded' },
            });
          expect(await successRows(lich!.paymentId)).toHaveLength(1);
          expect((await x.wallets.readWallet(x.walletId)).soDu).toBe(
            '50000.00',
          );
          const ledger = await db.query(
            "SELECT COUNT(*) AS n FROM giao_dich_vi WHERE loai = 'HoanTien'",
          );
          expect(Number(ledger[0].n)).toBe(1);
          const notices = await db.query(
            "SELECT COUNT(*) AS n FROM thong_bao WHERE loai_su_kien = 'HoanCocThanhCong'",
          );
          expect(Number(notices[0].n)).toBe(1);
          await assertWalletInvariants(db);
        },
      });
      const sum = tallyOutcomes(all.flat());
      process.stderr.write(
        `HCC-11/DTT-13: ${String(ROUNDS)} vòng × 3 refund; thành công=${String(sum.ok)}/${String(sum.total)}; đã thử lại 1213/1205=${String(retries())}; 1213 còn sót=${String(sum.deadlocks)}; 1205 còn sót=${String(sum.lockTimeouts)}\n`,
      );
      expect(sum).toMatchObject({
        total: ROUNDS * 3,
        ok: ROUNDS * 3,
        deadlocks: 0,
        lockTimeouts: 0,
        other: [],
      });
      expect(retries()).toBe(0);
    },
    TIMEOUT,
  );
});

describe('M2 hai hoàn cọc của CÙNG MỘT ví đồng thời (40 vòng)', () => {
  it(
    'khoá khoản (7a) rồi khoá ví X (7b) TRƯỚC mọi INSERT: cả hai hoàn cọc thành công, ví cộng đủ cả hai, 0 lần 1213 (kể cả trước khi thử lại)',
    async () => {
      const x = await refundWorld(2);
      const retries = watchRetries();
      const all = await runRounds({
        rounds: ROUNDS,
        setup: x.setup,
        race: (lichs, round) =>
          together(
            lichs.map(
              (lich) => () =>
                x.service.refund({
                  lichHenId: lich.lichHenId,
                  soTien: '40000.00',
                  lyDo: 'Huỷ',
                }),
            ),
            [0, round % 3],
          ),
        check: async (lichs, results) => {
          for (const result of results)
            expect(result).toMatchObject({
              status: 'fulfilled',
              value: { kind: 'Refunded' },
            });
          expect((await x.wallets.readWallet(x.walletId)).soDu).toBe(
            '80000.00',
          );
          for (const lich of lichs)
            expect(await successRows(lich.paymentId)).toHaveLength(1);
          await assertWalletInvariants(db);
        },
      });
      const sum = tallyOutcomes(all.flat());
      process.stderr.write(
        `M2 (hoàn cọc): ${String(ROUNDS)} vòng × 2 giao dịch; 1213 trước thử lại=${String(retries())}; 1213 còn sót=${String(sum.deadlocks)}\n`,
      );
      expect(sum).toMatchObject({
        ok: ROUNDS * 2,
        deadlocks: 0,
        lockTimeouts: 0,
        other: [],
      });
      expect(retries()).toBe(0);
    },
    TIMEOUT,
  );
});

describe('M14 hai bản RefundRetryJob chạy cùng lúc (40 vòng)', () => {
  it(
    'không thử trùng: đúng MỘT dòng ThanhCong và ví cộng đúng một lần; bản chạy sau thấy dòng mới dưới khoá 7a và không ghi thêm',
    async () => {
      const x = await refundWorld(1);
      const jobA = new RefundRetryJob(db, x.repository, x.service);
      const jobB = new RefundRetryJob(db, x.repository, x.service);
      const retries = watchRetries();
      const all = await runRounds({
        rounds: ROUNDS,
        setup: async () => {
          const [lich] = await x.setup();
          // Dòng ThatBai đã quá 5 phút so với mốc của lượt (T0 + 6 phút)
          await db.query(
            `INSERT INTO lich_su_hoan_tien (giao_dich_thanh_toan_id, vi_noi_bo_id, loai, so_tien, ly_do, trang_thai, so_lan_thu, thoi_diem)
             VALUES (?, ?, 'TuDong', 50000.00, 'Huỷ', 'ThatBai', 1, ?)`,
            [lich!.paymentId, x.walletId, T0],
          );
          return lich!;
        },
        race: (_lich, round) =>
          together(
            [
              () => jobA.run(new Date(T0.getTime() + 6 * MIN)),
              () => jobB.run(new Date(T0.getTime() + 6 * MIN)),
            ],
            [0, round % 3],
          ),
        check: async (lich, results) => {
          for (const result of results) expect(result.status).toBe('fulfilled');
          // Hai bản cùng thấy ứng viên nhưng chỉ MỘT lần cộng
          expect(await successRows(lich.paymentId)).toHaveLength(1);
          expect((await x.wallets.readWallet(x.walletId)).soDu).toBe(
            '50000.00',
          );
          const rows = await db.query(
            'SELECT so_lan_thu AS soLanThu FROM lich_su_hoan_tien WHERE giao_dich_thanh_toan_id = ? ORDER BY so_lan_thu',
            [lich.paymentId],
          );
          expect(
            rows.map((row: { soLanThu: number }) => Number(row.soLanThu)),
          ).toEqual([1, 2]);
          await assertWalletInvariants(db);
        },
      });
      const sum = tallyOutcomes(all.flat());
      process.stderr.write(
        `M14 (hai job thật): ${String(ROUNDS)} vòng; thử trùng=0; đã thử lại 1213/1205=${String(retries())}; 1213 còn sót=${String(sum.deadlocks)}\n`,
      );
      expect(sum).toMatchObject({
        ok: ROUNDS * 2,
        deadlocks: 0,
        lockTimeouts: 0,
        other: [],
      });
    },
    TIMEOUT,
  );
});

describe('DTT-16 hoàn cọc đua với confirmPaid, checkIn, markNoShow trên CÙNG lịch (40 vòng)', () => {
  it(
    'thông báo GẮN lich_hen_id (xin khoá chia sẻ trên lịch SAU khi giữ ví X) không gây 1213 lộ ra ngoài; bất biến booking (INV) và bất biến ví giữ ở mọi vòng',
    async () => {
      const w = await statusWorld(db, fx);
      const wallets = new WalletFixtures(db);
      const walletId = w.patient.wallet.viNoiBoId;
      const patientId = w.patient.account.taiKhoanId;
      const { service } = build();
      const transition = new AppointmentTransitionService(
        db,
        new SlotHoldService(),
        new FakeWaitlistPort(),
        new FakeAppointmentNotifier(),
      );
      const retries = watchRetries();

      const all = await runRounds({
        rounds: ROUNDS,
        setup: async () => {
          await resetMoneyAndAppointments();
          await wallets.setWallet(walletId, '0.00');
          // Lịch ĐÃ XÁC NHẬN có khoản cọc trả bằng ví: cả bốn việc cùng nhắm lịch này
          const lich = await fx.appointmentIn('DaXacNhan', {
            doctor: w.doctor.profile,
            khungGioId: w.slotIds[0]!,
            patientId,
          });
          await wallets.insertWalletDeposit({
            viNoiBoId: walletId,
            lichHenId: lich.lichHenId,
            soTien: '100000.00',
          });
          return lich;
        },
        race: (lich, round) =>
          together<unknown>(
            [
              () =>
                service.refund({
                  lichHenId: lich.lichHenId,
                  soTien: '50000.00',
                  lyDo: 'Huỷ',
                }),
              () =>
                withBookingTransaction(
                  db,
                  (em) =>
                    transition.confirmPaid(em, {
                      lichHenId: lich.lichHenId,
                      soTienDaThu: '100000.00',
                      now: toSecond(nowVN()),
                    }),
                  { label: 'dtt16-confirm-paid' },
                ),
              () =>
                runCheckIn(
                  db,
                  transition,
                  checkInInput(w, lich.lichHenId, 'ThanhToan'),
                ),
              () =>
                runNoShow(
                  db,
                  transition,
                  noShowInput(w, lich.lichHenId, 'HeThong'),
                ),
            ],
            [0, round % 3, (round + 1) % 3, (round + 2) % 3],
          ),
        check: async (_lich, results) => {
          const sum = tallyOutcomes(results);
          // MỌI việc phải XONG có kết quả có kiểu (Refunded, hay kết quả từ chối của lõi): không 1213, 1205 hay lỗi lạ lộ ra
          expect(sum).toMatchObject({
            ok: 4,
            deadlocks: 0,
            lockTimeouts: 0,
            other: [],
          });
          await assertBookingInvariants(db);
          await assertWalletInvariants(db);
        },
      });
      const sum = tallyOutcomes(all.flat());
      process.stderr.write(
        `DTT-16: ${String(ROUNDS)} vòng × 4 việc; xong=${String(sum.ok)}/${String(sum.total)}; đã thử lại 1213/1205=${String(retries())}; 1213 lộ ra=${String(sum.deadlocks)}; 1205 lộ ra=${String(sum.lockTimeouts)}\n`,
      );
      expect(sum).toMatchObject({
        total: ROUNDS * 4,
        ok: ROUNDS * 4,
        deadlocks: 0,
        lockTimeouts: 0,
        other: [],
      });
    },
    TIMEOUT,
  );
});
