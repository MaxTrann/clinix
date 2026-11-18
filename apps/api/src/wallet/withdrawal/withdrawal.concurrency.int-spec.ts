import type { DataSource } from 'typeorm';
import {
  createGate,
  runRounds,
} from '../../appointments/testing/concurrency-harness.js';
import { sleep } from '../../appointments/testing/concurrency-report.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import {
  signedVnpayIpn,
  topupStack,
} from '../../payment/testing/topup-stack.js';
import type { CreateTopupDto } from '../../payment/topup/topup.dto.js';
import { WalletFixtures } from '../testing/wallet-fixtures.js';
import { assertWalletInvariants } from '../testing/wallet-invariants.js';
import { withdrawalStack } from '../testing/withdrawal-stack.js';

// payment B11 — rút tiền ĐỒNG THỜI trên MySQL 8.4 THẬT (PLAN 5.3, 5.8; DTT-10, RTV-04 phần đồng thời; M7). Mỗi vòng dựng Bệnh nhân + ví MỚI, các bên cùng xuất phát qua `createGate`.
// Mọi lỗi ngoài "từ chối nghiệp vụ" (AppException) làm ca đỏ: không 1213, 1205, 3819 nào lọt ra. CHẠY MỘT MÌNH (nhạy với tải máy).
const ROUNDS = 30;
/**
 * Vòng chẵn bên rút trễ `LAG_MS` sau cổng: xuất phát cùng lúc thì bên rút gần như luôn thắng (đo: 29/30), còn trễ tăng dần (nếp B5, 2 ms mỗi vòng) thì nạp gần như luôn thắng (28/30).
 * Xen kẽ hai chế độ để cả hai thứ tự đều xảy ra nhiều lần.
 */
const LAG_MS = 20;

let db: DataSource;
let wf: WalletFixtures;
useIntegrationHooks((d) => {
  db = d;
  wf = new WalletFixtures(d);
});

/** Kết quả một bên rút: `true` = đã tạo yêu cầu; mã lỗi nghiệp vụ nếu bị từ chối. Lỗi khác ném lên (ca đỏ). */
const outcomeOf = (work: Promise<unknown>) =>
  work
    .then(() => true as const)
    .catch((error: unknown) => {
      if (error instanceof AppException) return error.maLoi;
      throw error;
    });

const pendingCount = async (walletId: string) =>
  Number(
    (
      await db.query<{ n: string }[]>(
        "SELECT COUNT(*) AS n FROM yeu_cau_rut_tien WHERE vi_noi_bo_id = ? AND trang_thai = 'ChoDuyet'",
        [walletId],
      )
    )[0]!.n,
  );

describe('rút tiền đồng thời (payment B11)', () => {
  it(`DTT-10 rút tiền đua nạp (IPN) cùng ví ⇒ số dư và phần giữ đúng theo thứ tự thắng; không lỗi lạ (${ROUNDS} vòng)`, async () => {
    const { topups, ipn } = topupStack(db);
    await runRounds({
      rounds: ROUNDS,
      // Ví 100.000 và một giao dịch nạp 50.000 đang chờ IPN; bên rút xin 120.000: chỉ đủ khi IPN cộng TRƯỚC
      setup: async () => {
        const { patientId, walletId } = await wf.patientWithWallet();
        await wf.fundWallet(walletId, '100000.00');
        const { maGiaoDich } = await topups.create(
          patientId,
          { soTien: '50000', phuongThuc: 'VNPay' } as CreateTopupDto,
          '127.0.0.1',
        );
        return { patientId, walletId, maGiaoDich };
      },
      race: ({ patientId, maGiaoDich }, round) => {
        const gate = createGate(2);
        return [
          async () => {
            await gate.arrive();
            await sleep(round % 2 === 0 ? LAG_MS : 0);
            return outcomeOf(withdrawalStack(db).request(patientId, '120000'));
          },
          async () => {
            await gate.arrive();
            const ack = await ipn.handle(
              'VNPay',
              signedVnpayIpn({ giaoDichId: maGiaoDich, soTien: '50000.00' }),
            );
            return ack?.RspCode ?? 'null';
          },
        ];
      },
      check: async ({ walletId }, results) => {
        const [withdraw, ipnCode] = results.map((r) =>
          r.status === 'fulfilled' ? r.value : `lỗi: ${String(r.reason)}`,
        );
        expect(ipnCode).toBe('00');
        expect([true, 'SO_DU_KHONG_DU']).toContain(withdraw);
        const wallet = await wf.readWallet(walletId);
        expect(wallet.soDu).toBe('150000.00');
        expect(wallet.soTienDangGiu).toBe(
          withdraw === true ? '120000.00' : '0.00',
        );
        expect(await pendingCount(walletId)).toBe(withdraw === true ? 1 : 0);
        await assertWalletInvariants(db);
      },
    });
  }, 300_000);

  it(`RTV-04 (đồng thời) hai yêu cầu rút cùng ví cùng lúc ⇒ đúng một ChoDuyet, đúng một phần giữ; bên kia 409 (${ROUNDS} vòng)`, async () => {
    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        const { patientId, walletId } = await wf.patientWithWallet();
        await wf.fundWallet(walletId, '350000.00');
        return { patientId, walletId };
      },
      race: ({ patientId }) => {
        const gate = createGate(2);
        return ['100000', '50000'].map((soTien) => async () => {
          await gate.arrive();
          return outcomeOf(withdrawalStack(db).request(patientId, soTien));
        });
      },
      check: async ({ walletId }, results) => {
        const values = results.map((r) =>
          r.status === 'fulfilled' ? r.value : `lỗi: ${String(r.reason)}`,
        );
        expect(values.filter((v) => v === true)).toHaveLength(1);
        expect(
          values.filter((v) => v === 'DA_CO_YEU_CAU_CHO_DUYET'),
        ).toHaveLength(1);
        expect(await pendingCount(walletId)).toBe(1);
        const held = (await wf.readWallet(walletId)).soTienDangGiu;
        expect(['100000.00', '50000.00']).toContain(held);
        await assertWalletInvariants(db);
      },
    });
  }, 300_000);
});
