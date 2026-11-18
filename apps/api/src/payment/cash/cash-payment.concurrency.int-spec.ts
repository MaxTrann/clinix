import type { DataSource } from 'typeorm';
import { BookingFixtures } from '../../appointments/testing/booking-fixtures.js';
import {
  createGate,
  runRounds,
} from '../../appointments/testing/concurrency-harness.js';
import {
  reportRounds,
  winnerTally,
} from '../../appointments/testing/concurrency-report.js';
import { failureOf } from '../../appointments/testing/create-appointment-world.js';
import { assertBookingInvariants } from '../../appointments/testing/invariants.js';
import { failAfterStatement } from '../../appointments/testing/statement-recorder.js';
import { IN_WINDOW } from '../../appointments/testing/status-world.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { assertWalletInvariants } from '../../wallet/testing/wallet-invariants.js';
import { cashRows, cashWorld, stateOf } from '../testing/cash-stack.js';

// payment B6 — thu tiền mặt ĐỒNG THỜI và hoàn tác trên MySQL 8.4 THẬT (PLAN payment 5.3, E7; TTQ-06 = DTT-11; M3). Mỗi vòng dựng dữ liệu MỚI; các bên xuất phát cùng lúc qua `createGate`.
// "0 deadlock" nghĩa là KHÔNG 1213 hay 1205 nào còn sót sau `withBookingTransaction` (hai bên cùng khoá `lich_hen` trước nên không có chu trình khoá). CHẠY MỘT MÌNH (nhạy với tải máy).
// Số vòng `[đề xuất]`: DTT-11 30 vòng (như B5), M3 100 vòng đúng ngưỡng PLAN.
const ROUNDS = 30;
const M3_ROUNDS = 100;

let db: DataSource;
let fx: BookingFixtures;
let logs: string[] = [];
useIntegrationHooks((d, captured) => {
  db = d;
  fx = new BookingFixtures(d);
  logs = captured;
});

const settled = async () => {
  await assertBookingInvariants(db);
  await assertWalletInvariants(db);
};

// Deadlock giả đúng hình lỗi mà `isDeadlockError` nhận ra (errno 1213), để ép `withBookingTransaction` rollback rồi chạy lại thân (như CNL-08 của booking)
const deadlock = () =>
  Object.assign(new Error('deadlock giả'), {
    errno: 1213,
    code: 'ER_LOCK_DEADLOCK',
  });

describe('DTT-11 (TTQ-06) ★ hai Lễ tân thu tiền mặt cùng lịch cùng lúc', () => {
  it(`${String(ROUNDS)} vòng: đúng MỘT khoản được ghi; bên kia 409 LICH_HEN_KHONG_CHO_THU_TIEN (DaTiepDon); không 1213, không lỗi lạ`, async () => {
    const winners = winnerTally();
    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        vi.setSystemTime(IN_WINDOW);
        const w = await cashWorld(db, fx);
        return { w, lich: await w.appointment(0) };
      },
      race: ({ w, lich }) => {
        const gate = createGate(2);
        return [0, 1].map(() => async () => {
          await gate.arrive();
          return w.service.collect(w.receptionId, lich.maLichHen, '300000');
        });
      },
      check: async ({ lich }, results) => {
        const ok = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.flatMap((r) =>
          r.status === 'rejected' ? [r.reason as unknown] : [],
        );
        expect(ok).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        // Lỗi lạ (1213 còn sót, lỗi SQL) không phải AppException ⇒ `failureOf` làm ca đỏ
        const failed = await failureOf(Promise.reject(rejected[0]));
        expect(failed.status).toBe(409);
        expect(failed.body).toMatchObject({
          maLoi: 'LICH_HEN_KHONG_CHO_THU_TIEN',
          chiTiet: { trangThai: 'DaTiepDon' },
        });
        expect(await cashRows(db, lich.lichHenId)).toHaveLength(1);
        expect(await stateOf(db, lich.lichHenId)).toBe('DaTiepDon');
        await settled();
        winners.add('một 200, một 409');
      },
    });
    reportRounds('B6-DTT', 'DTT-11', ROUNDS, winners.winners, logs);
  });
});

describe('M3 hoàn tác SAU khi checkIn đã ghi (PaymentAbort) và thân chạy lại khi 1213', () => {
  it(`${String(M3_ROUNDS)} vòng SO_TIEN_KHONG_KHOP: mỗi vòng lịch vẫn DaXacNhan, không khoản tiền mặt, không thong_bao; lỗi không bị coi là "thử lại"`, async () => {
    vi.setSystemTime(IN_WINDOW);
    const w = await cashWorld(db, fx);
    const lich = await w.appointment(0, { coc: '100000.00' });
    const notices = async () =>
      Number(
        (
          await db.query<{ n: string }[]>('SELECT COUNT(*) AS n FROM thong_bao')
        )[0]!.n,
      );
    const before = await notices();
    let rolledBack = 0;
    for (let round = 1; round <= M3_ROUNDS; round += 1) {
      const failure = await failureOf(
        w.service.collect(w.receptionId, lich.maLichHen, '300000'),
      );
      expect(failure.body.maLoi, `vòng ${String(round)}`).toBe(
        'SO_TIEN_KHONG_KHOP',
      );
      if (
        (await stateOf(db, lich.lichHenId)) === 'DaXacNhan' &&
        (await cashRows(db)).length === 0
      )
        rolledBack += 1;
    }
    expect(rolledBack).toBe(M3_ROUNDS);
    expect(await notices()).toBe(before);
    await settled();
    // `PaymentAbort` không phải 1213/1205 nên `withBookingTransaction` không chạy lại thân lần nào
    reportRounds(
      'B6-M3',
      'M3 hoàn tác',
      M3_ROUNDS,
      { 'hoàn tác trọn': rolledBack },
      logs,
    );
  });

  it('1213 một lần SAU INSERT giao_dich_thanh_toan: hoàn tác rồi chạy lại thân từ đầu; kết quả như chạy một lần (MỘT khoản, đúng số, DaTiepDon), không dấu vết lần trước', async () => {
    vi.setSystemTime(IN_WINDOW);
    const w = await cashWorld(db, fx);
    const lich = await w.appointment(0, { coc: '100000.00' });
    const matched = failAfterStatement(
      db,
      /^\s*INSERT INTO giao_dich_thanh_toan/i,
      deadlock(),
    );

    const result = await w.service.collect(
      w.receptionId,
      lich.maLichHen,
      '200000',
    );

    // Câu INSERT chạy HAI lần (lần đầu bị hoàn tác), cùng tham số
    expect(matched).toHaveLength(2);
    expect(matched[1]!.params).toEqual(matched[0]!.params);
    const rows = await cashRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.soTien).toBe('200000.00');
    expect(result.phieuThu.soPhieu).toBe(rows[0]!.id);
    expect(result.phieuThu).toMatchObject({
      daThanhToanTruoc: '100000.00',
      thuTaiQuay: '200000.00',
    });
    expect(await stateOf(db, lich.lichHenId)).toBe('DaTiepDon');
    await settled();
  });
});
