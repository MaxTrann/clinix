import type { DataSource } from 'typeorm';
import {
  createGate,
  runRounds,
} from '../../appointments/testing/concurrency-harness.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { WalletFixtures } from '../../wallet/testing/wallet-fixtures.js';
import { assertWalletInvariants } from '../../wallet/testing/wallet-invariants.js';
import { pendingTopup, reconcileStack } from '../testing/reconcile-stack.js';
import { signedVnpayIpn, topupStack } from '../testing/topup-stack.js';

// payment B14 — đối soát nạp ví ĐỒNG THỜI trên MySQL 8.4 THẬT (PLAN 5.3, 5.4; DST-06, DTT-08; M14 với job thật). Mỗi vòng dựng Bệnh nhân + giao dịch `ChoDoiSoat` MỚI, các bên cùng xuất phát
// qua `createGate`. Hai bản job là HAI đối tượng riêng (cờ `running` không chặn nhau, như hai tiến trình API). Kết quả không được có 1213, 1205 hay lỗi lạ nào lọt ra (`run` không ném;
// lỗi ⇒ đếm `failed`). CHẠY MỘT MÌNH (nhạy với tải máy).
const ROUNDS = 30;
const NOW = new Date('2026-11-02T08:10:00+07:00');

let db: DataSource;
let wf: WalletFixtures;
let logs: string[] = [];
useIntegrationHooks((d, captured) => {
  db = d;
  wf = new WalletFixtures(d);
  logs = captured;
});

const one = async <T>(sql: string, params: unknown[]) =>
  (await db.query<T[]>(sql, params))[0]!;
const napRows = async (id: string) =>
  Number(
    (
      await one<{ n: string }>(
        "SELECT COUNT(*) AS n FROM giao_dich_vi WHERE giao_dich_thanh_toan_id = ? AND loai = 'Nap'",
        [id],
      )
    ).n,
  );
const attempts = (id: string) =>
  db.query<{ n: number; ketQua: string }[]>(
    'SELECT so_lan_thu AS n, ket_qua AS ketQua FROM lan_doi_soat_nap_vi WHERE giao_dich_thanh_toan_id = ? ORDER BY so_lan_thu',
    [id],
  );

describe('đối soát nạp ví đồng thời (payment B14)', () => {
  it(`DST-06 hai bản job cùng lúc ⇒ cộng đúng một lần, đúng một lần thử mới (${ROUNDS} vòng)`, async () => {
    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        const { walletId } = await wf.patientWithWallet();
        return { walletId, id: await pendingTopup(db, wf, { walletId }) };
      },
      race: () => {
        const gate = createGate(2);
        return [reconcileStack(db).job, reconcileStack(db).job].map(
          (job) => async () => {
            await gate.arrive();
            return job.run(NOW);
          },
        );
      },
      check: async ({ walletId, id }, results) => {
        const summaries = results.map((r) =>
          r.status === 'fulfilled' ? r.value : undefined,
        );
        expect(summaries.every((s) => s !== undefined && s.failed === 0)).toBe(
          true,
        );
        expect(summaries.reduce((sum, s) => sum + (s?.credited ?? 0), 0)).toBe(
          1,
        );
        expect(await napRows(id)).toBe(1);
        expect((await attempts(id)).map((a) => [a.n, a.ketQua])).toEqual([
          [0, 'ThatBai'],
          [1, 'ThanhCong'],
        ]);
        expect(await wf.readWallet(walletId)).toMatchObject({
          soDu: '100000.00',
        });
        await assertWalletInvariants(db);
      },
    });
  }, 300_000);

  it(`DST-06 hai bản job cùng lúc trên giao dịch cộng lỗi ⇒ KHÔNG thử trùng: đúng một lần thử ThatBai mới (${ROUNDS} vòng)`, async () => {
    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        const { walletId } = await wf.patientWithWallet();
        await wf.fundWallet(walletId, '9999999999.99');
        return { id: await pendingTopup(db, wf, { walletId }) };
      },
      race: () => {
        const gate = createGate(2);
        return [reconcileStack(db).job, reconcileStack(db).job].map(
          (job) => async () => {
            await gate.arrive();
            return job.run(NOW);
          },
        );
      },
      check: async ({ id }, results) => {
        expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
        expect((await attempts(id)).map((a) => [a.n, a.ketQua])).toEqual([
          [0, 'ThatBai'],
          [1, 'ThatBai'],
        ]);
        expect(await napRows(id)).toBe(0);
      },
    });
  }, 300_000);

  it(`DST-06 (đua sát) hai lời đối soát cùng giao dịch cùng lúc, bỏ qua bước chọn ứng viên ⇒ đúng một Credited, một Skipped, cộng một lần (${ROUNDS} vòng)`, async () => {
    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        const { walletId } = await wf.patientWithWallet();
        return { walletId, id: await pendingTopup(db, wf, { walletId }) };
      },
      // Gọi thẳng dịch vụ để hai bên đua đúng ở đoạn đọc dòng nạp rồi khoá: bỏ khoá 7a thì cả hai cùng thấy ChoDoiSoat và cộng hai lần
      race: ({ id }) => {
        const gate = createGate(2);
        return [reconcileStack(db).service, reconcileStack(db).service].map(
          (service) => async () => {
            await gate.arrive();
            return service.reconcile(id, NOW);
          },
        );
      },
      check: async ({ walletId, id }, results) => {
        const outcomes = results.map((r) =>
          r.status === 'fulfilled' ? r.value : 'lỗi',
        );
        expect(outcomes.toSorted()).toEqual(['Credited', 'Skipped']);
        // Bên sau phải dừng NHỜ KHOÁ 7a (thấy DaDoiSoat), không phải nhờ lưới thứ hai UNIQUE (cộng rồi 1062 rồi hoàn tác): không có lần cộng lỗi nào
        expect(logs.filter((line) => line.includes('cộng ví lỗi'))).toEqual([]);
        expect(await napRows(id)).toBe(1);
        expect(await wf.readWallet(walletId)).toMatchObject({
          soDu: '100000.00',
        });
        await assertWalletInvariants(db);
      },
    });
  }, 300_000);

  it(`DTT-08 IPN gửi lại đồng thời với job trên cùng giao dịch ⇒ cộng một lần; IPN luôn 02 (${ROUNDS} vòng)`, async () => {
    const { ipn } = topupStack(db);
    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        const { walletId } = await wf.patientWithWallet();
        return { walletId, id: await pendingTopup(db, wf, { walletId }) };
      },
      race: ({ id }) => {
        const gate = createGate(2);
        return [
          async () => {
            await gate.arrive();
            return (
              await ipn.handle(
                'VNPay',
                signedVnpayIpn({ giaoDichId: id, soTien: '100000.00' }),
              )
            )?.RspCode;
          },
          async () => {
            await gate.arrive();
            // Cả hai bên trả CHUỖI để runRounds có một kiểu kết quả
            return String((await reconcileStack(db).job.run(NOW))?.credited);
          },
        ];
      },
      check: async ({ walletId, id }, results) => {
        expect(
          results.map((r) => (r.status === 'fulfilled' ? r.value : 'lỗi')),
        ).toEqual(['02', '1']);
        expect(await napRows(id)).toBe(1);
        expect(await wf.readWallet(walletId)).toMatchObject({
          soDu: '100000.00',
        });
        await assertWalletInvariants(db);
      },
    });
  }, 300_000);
});
