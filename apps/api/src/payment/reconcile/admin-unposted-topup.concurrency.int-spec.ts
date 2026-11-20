import type { DataSource } from 'typeorm';
import {
  createGate,
  runRounds,
} from '../../appointments/testing/concurrency-harness.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { WalletFixtures } from '../../wallet/testing/wallet-fixtures.js';
import { assertWalletInvariants } from '../../wallet/testing/wallet-invariants.js';
import {
  EXHAUSTED_ATTEMPTS,
  pendingTopup,
  reconcileStack,
  unpostedStack,
} from '../testing/reconcile-stack.js';

// payment B15 — Quản trị viên cộng ví ĐỒNG THỜI trên MySQL 8.4 THẬT (PLAN 5.3, 5.4 bước 6; NVC-05, DTT-15). Mỗi vòng dựng Bệnh nhân + giao dịch đã hết lượt tự động MỚI; các bên cùng
// xuất phát qua `createGate`. Bên thua phải nhận lỗi NGHIỆP VỤ đã lường trước (409), không 1213, 1205 hay lỗi lạ. CHẠY MỘT MÌNH (nhạy với tải máy). Dữ liệu giả.
const ROUNDS = 30;
const NOW = new Date('2026-11-02T08:30:00+07:00');

let db: DataSource;
let wf: WalletFixtures;
useIntegrationHooks((d) => {
  db = d;
  wf = new WalletFixtures(d);
});

const napRows = async (id: string) =>
  Number(
    (
      await db.query<{ n: string }[]>(
        "SELECT COUNT(*) AS n FROM giao_dich_vi WHERE giao_dich_thanh_toan_id = ? AND loai = 'Nap'",
        [id],
      )
    )[0]!.n,
  );
const attempts = (id: string) =>
  db.query<{ n: number; ketQua: string }[]>(
    'SELECT so_lan_thu AS n, ket_qua AS ketQua FROM lan_doi_soat_nap_vi WHERE giao_dich_thanh_toan_id = ? ORDER BY so_lan_thu',
    [id],
  );
const maLoiOf = (reason: unknown) =>
  (reason as { getResponse?: () => { maLoi?: string } }).getResponse?.().maLoi;

async function setup() {
  const { walletId } = await wf.patientWithWallet();
  const id = await pendingTopup(db, wf, {
    walletId,
    attempts: EXHAUSTED_ATTEMPTS,
  });
  const a = await wf.admin.admin();
  const b = await wf.admin.admin();
  return {
    walletId,
    id,
    adminA: a.account.taiKhoanId,
    adminB: b.account.taiKhoanId,
  };
}

describe('Quản trị viên cộng ví đồng thời (payment B15)', () => {
  it(`NVC-05 ★ hai Quản trị viên cùng bấm Cộng ví ⇒ cộng đúng MỘT lần; bên kia 409 GIAO_DICH_NAP_DA_DOI_SOAT (${ROUNDS} vòng)`, async () => {
    await runRounds({
      rounds: ROUNDS,
      setup,
      race: ({ id, adminA, adminB }) => {
        const gate = createGate(2);
        return [adminA, adminB].map((adminId) => async () => {
          await gate.arrive();
          return unpostedStack(db).credit(adminId, id);
        });
      },
      check: async ({ walletId, id }, results) => {
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        const rejected = results.filter((r) => r.status === 'rejected');
        expect(rejected.map((r) => maLoiOf(r.reason))).toEqual([
          'GIAO_DICH_NAP_DA_DOI_SOAT',
        ]);
        expect(await napRows(id)).toBe(1);
        expect((await attempts(id)).map((a) => [a.n, a.ketQua])).toEqual([
          [0, 'ThatBai'],
          [1, 'ThatBai'],
          [2, 'ThatBai'],
          [3, 'ThatBai'],
          [4, 'ThanhCong'],
        ]);
        expect(await wf.readWallet(walletId)).toMatchObject({
          soDu: '100000.00',
        });
        await assertWalletInvariants(db);
      },
    });
  }, 300_000);

  it(`DTT-15 Cộng ví thủ công đua job đối soát (kể cả gọi thẳng lời đối soát, bỏ bước chọn ứng viên) ⇒ cộng đúng một lần, job bỏ qua (${ROUNDS} vòng)`, async () => {
    // Ba bên trả ba kiểu khác nhau (kết quả cộng ví, tổng kết job, kết quả một lời đối soát)
    await runRounds<Awaited<ReturnType<typeof setup>>, unknown>({
      rounds: ROUNDS,
      setup,
      race: ({ id, adminA }) => {
        const gate = createGate(3);
        const { job, service } = reconcileStack(db);
        return [
          async () => {
            await gate.arrive();
            return unpostedStack(db).credit(adminA, id);
          },
          async () => {
            await gate.arrive();
            return job.run(NOW);
          },
          async () => {
            await gate.arrive();
            return service.reconcile(id, NOW);
          },
        ];
      },
      check: async ({ walletId, id }, results) => {
        expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
        const [credit, run, direct] = results.map((r) =>
          r.status === 'fulfilled' ? r.value : undefined,
        );
        expect(credit).toEqual({
          maGiaoDich: id,
          trangThaiDoiSoat: 'DaDoiSoat',
        });
        expect(run).toMatchObject({ credited: 0, failed: 0 });
        expect(direct).toBe('Skipped');
        expect(await napRows(id)).toBe(1);
        expect((await attempts(id)).map((a) => a.n)).toEqual([0, 1, 2, 3, 4]);
        expect(await wf.readWallet(walletId)).toMatchObject({
          soDu: '100000.00',
        });
        await assertWalletInvariants(db);
      },
    });
  }, 300_000);

  it(`Cộng ví đua "Không thể xử lý" ⇒ cộng đúng một lần, số lần thử không trùng; nếu "Không thể xử lý" đến sau thì 409 (${ROUNDS} vòng)`, async () => {
    await runRounds({
      rounds: ROUNDS,
      setup,
      race: ({ id, adminA, adminB }) => {
        const gate = createGate(2);
        return [
          async () => {
            await gate.arrive();
            return unpostedStack(db).credit(adminA, id);
          },
          async () => {
            await gate.arrive();
            return unpostedStack(db).markUnprocessable(
              adminB,
              id,
              'Đang chờ ngân hàng tra soát giao dịch này',
            );
          },
        ];
      },
      check: async ({ id }, results) => {
        expect(results[0]!.status).toBe('fulfilled');
        if (results[1]!.status === 'rejected')
          expect(maLoiOf(results[1]!.reason)).toBe('GIAO_DICH_NAP_DA_DOI_SOAT');
        expect(await napRows(id)).toBe(1);
        const ns = (await attempts(id)).map((a) => a.n);
        expect(new Set(ns).size).toBe(ns.length);
        await assertWalletInvariants(db);
      },
    });
  }, 300_000);
});
