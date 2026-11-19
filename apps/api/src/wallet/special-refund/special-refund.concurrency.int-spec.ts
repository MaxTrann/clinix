import type { DataSource } from 'typeorm';
import {
  createGate,
  runRounds,
} from '../../appointments/testing/concurrency-harness.js';
import { sleep } from '../../appointments/testing/concurrency-report.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import {
  specialRefundStack,
  specialRefundWorld,
} from '../testing/special-refund-stack.js';
import { assertWalletInvariants } from '../testing/wallet-invariants.js';

// payment B13 — hoàn đặc biệt ĐỒNG THỜI trên MySQL 8.4 THẬT (PLAN 5.3 dòng "Hoàn tiền đặc biệt"; HDB-08, DTT-12). Mỗi vòng dựng thế giới MỚI (khoản cọc 100.000đ), hai bên cùng xuất phát qua `createGate`.
// Mọi lỗi ngoài "từ chối nghiệp vụ" (AppException) làm ca đỏ: không 1213, 1205, 3819, 1062 nào lọt ra. CHẠY MỘT MÌNH (nhạy với tải máy).
const ROUNDS = 30;
/** Vòng chẵn bên hoàn đặc biệt trễ `LAG_MS` sau cổng: xuất phát cùng lúc thì hoàn đặc biệt gần như luôn thắng (đo 19/11/2026: 29/30), nên xen kẽ để cả hai thứ tự đều xảy ra (nếp DTT-10 của B11). */
const LAG_MS = 20;

let db: DataSource;
useIntegrationHooks((d) => {
  db = d;
});

/** `true` = thành công; mã lỗi nghiệp vụ nếu bị từ chối. Lỗi khác ném lên (ca đỏ). */
const outcomeOf = (work: Promise<unknown>) =>
  work
    .then(() => true as const)
    .catch((error: unknown) => {
      if (error instanceof AppException) return error.maLoi;
      throw error;
    });

const settled = (results: PromiseSettledResult<unknown>[]) =>
  results.map((r) =>
    r.status === 'fulfilled' ? r.value : `lỗi: ${String(r.reason)}`,
  );

const totalRefunded = async (paymentId: string) =>
  (
    await db.query<{ tong: string }[]>(
      "SELECT CAST(COALESCE(SUM(so_tien), 0) AS CHAR) AS tong FROM lich_su_hoan_tien WHERE giao_dich_thanh_toan_id = ? AND trang_thai = 'ThanhCong'",
      [paymentId],
    )
  )[0]!.tong;

describe('hoàn đặc biệt đồng thời (payment B13)', () => {
  it(`HDB-08 ★, DTT-12 hoàn đặc biệt 80.000 ĐUA hoàn cọc tự động 50.000 cùng khoản 100.000 ⇒ tuần tự ở khoá 7a, tổng hoàn ≤ đã thanh toán, đúng một trong hai trường hợp (${ROUNDS} vòng)`, async () => {
    const tally = { specialFirst: 0, autoFirst: 0 };
    await runRounds({
      rounds: ROUNDS,
      setup: () => specialRefundWorld(db),
      race: (t, round) => {
        const stack = specialRefundStack(db);
        const gate = createGate(2);
        return [
          async () => {
            await gate.arrive();
            await sleep(round % 2 === 0 ? LAG_MS : 0);
            return outcomeOf(stack.refund(t.adminId, t.paymentId, '80000'));
          },
          async () => {
            await gate.arrive();
            const result = await stack.autoRefund.refund({
              lichHenId: t.lich.lichHenId,
              soTien: '50000.00',
              lyDo: 'Huỷ trước 2 giờ',
            });
            return result.kind;
          },
        ];
      },
      check: async (t, results) => {
        const [special, auto] = settled(results);
        // Hoàn tự động không bao giờ thất bại vì đua: nó chỉ bị CẮT theo trần
        expect(auto).toBe('Refunded');
        const total = await totalRefunded(t.paymentId);
        if (special === true) {
          // Đặc biệt trước (80.000) ⇒ tự động chỉ còn 20.000
          tally.specialFirst += 1;
          expect(total).toBe('100000.00');
        } else {
          // Tự động trước (50.000) ⇒ đặc biệt 80.000 vượt 50.000 còn lại
          tally.autoFirst += 1;
          expect(special).toBe('SO_TIEN_HOAN_VUOT_QUA_DA_THANH_TOAN');
          expect(total).toBe('50000.00');
        }
        expect((await t.wallets.readWallet(t.walletId)).soDu).toBe(total);
        await assertWalletInvariants(db);
      },
    });
    // Báo thứ tự thắng để biết hai bên có thật sự đua (không ép tỉ lệ: phụ thuộc máy)
    console.info(
      `HDB-08 thứ tự thắng: đặc biệt trước ${tally.specialFirst}, tự động trước ${tally.autoFirst}`,
    );
  }, 300_000);

  it(`HDB-06 (đồng thời) hai Quản trị viên hoàn đặc biệt CÙNG khoản cùng lúc ⇒ đúng một thành công, bên kia DA_HOAN_DAC_BIET; ví chỉ cộng một lần (${ROUNDS} vòng)`, async () => {
    await runRounds({
      rounds: ROUNDS,
      setup: () => specialRefundWorld(db),
      race: (t) => {
        const stack = specialRefundStack(db);
        const gate = createGate(2);
        return ['30000', '40000'].map((soTien) => async () => {
          await gate.arrive();
          return outcomeOf(stack.refund(t.adminId, t.paymentId, soTien));
        });
      },
      check: async (t, results) => {
        const values = settled(results);
        expect(values.filter((v) => v === true)).toHaveLength(1);
        expect(values.filter((v) => v === 'DA_HOAN_DAC_BIET')).toHaveLength(1);
        const total = await totalRefunded(t.paymentId);
        expect(['30000.00', '40000.00']).toContain(total);
        expect((await t.wallets.readWallet(t.walletId)).soDu).toBe(total);
        await assertWalletInvariants(db);
      },
    });
  }, 300_000);
});
