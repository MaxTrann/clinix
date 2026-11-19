import type { DataSource } from 'typeorm';
import {
  createGate,
  runRounds,
} from '../../appointments/testing/concurrency-harness.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import { adminWithdrawalStack } from '../testing/admin-withdrawal-stack.js';
import { WalletFixtures } from '../testing/wallet-fixtures.js';
import { assertWalletInvariants } from '../testing/wallet-invariants.js';
import { withdrawalStack } from '../testing/withdrawal-stack.js';

// payment B12 — duyệt và từ chối rút tiền ĐỒNG THỜI trên MySQL 8.4 THẬT (PLAN 5.3 dòng "Duyệt / từ chối rút"; XRT-05, DTT-09). Mỗi vòng dựng Bệnh nhân, ví, yêu cầu MỚI; hai bên cùng xuất phát qua `createGate`.
// Mọi lỗi ngoài "từ chối nghiệp vụ" (AppException) làm ca đỏ: không 1213, 1205, 3819 nào lọt ra. CHẠY MỘT MÌNH (nhạy với tải máy).
const ROUNDS = 30;

let db: DataSource;
let wf: WalletFixtures;
useIntegrationHooks((d) => {
  db = d;
  wf = new WalletFixtures(d);
});

/** `true` = bên này thắng; mã lỗi nghiệp vụ nếu bị từ chối. Lỗi khác ném lên (ca đỏ). */
const outcomeOf = (work: Promise<unknown>) =>
  work
    .then(() => true as const)
    .catch((error: unknown) => {
      if (error instanceof AppException) return error.maLoi;
      throw error;
    });

async function setupRequest() {
  const patient = await wf.patientWithWallet();
  await wf.fundWallet(patient.walletId, '350000.00');
  const { maYeuCau } = await withdrawalStack(db).request(
    patient.patientId,
    '100000',
  );
  const admin = await wf.admin.admin();
  const other = await wf.admin.admin();
  return {
    ...patient,
    maYeuCau,
    adminA: admin.account.taiKhoanId,
    adminB: other.account.taiKhoanId,
  };
}

const settled = (results: PromiseSettledResult<unknown>[]) =>
  results.map((r) =>
    r.status === 'fulfilled' ? r.value : `lỗi: ${String(r.reason)}`,
  );

const countOf = async (sql: string, params: unknown[]) =>
  Number((await db.query<{ n: string }[]>(sql, params))[0]!.n);

describe('duyệt và từ chối rút tiền đồng thời (payment B12)', () => {
  it(`XRT-05, DTT-09 ★ hai Quản trị viên duyệt CÙNG yêu cầu ⇒ đúng một bên thắng, bên kia 409 YEU_CAU_DA_XU_LY; ví chỉ bị trừ MỘT lần (${ROUNDS} vòng)`, async () => {
    const service = adminWithdrawalStack(db);
    await runRounds({
      rounds: ROUNDS,
      setup: setupRequest,
      race: (ctx) => {
        const gate = createGate(2);
        return [ctx.adminA, ctx.adminB].map((adminId) => async () => {
          await gate.arrive();
          return outcomeOf(service.approve(adminId, ctx.maYeuCau));
        });
      },
      check: async (ctx, results) => {
        const values = settled(results);
        expect(values.filter((v) => v === true)).toHaveLength(1);
        expect(values.filter((v) => v === 'YEU_CAU_DA_XU_LY')).toHaveLength(1);
        expect(await wf.readWallet(ctx.walletId)).toEqual({
          soDu: '250000.00',
          soTienDangGiu: '0.00',
        });
        expect(
          await countOf(
            "SELECT COUNT(*) AS n FROM giao_dich_vi WHERE vi_noi_bo_id = ? AND loai = 'Rut'",
            [ctx.walletId],
          ),
        ).toBe(1);
        expect(
          await countOf(
            "SELECT COUNT(*) AS n FROM nhat_ky_hanh_dong WHERE loai_doi_tuong = 'yeu_cau_rut_tien' AND ma_doi_tuong = ?",
            [ctx.maYeuCau],
          ),
        ).toBe(1);
        await assertWalletInvariants(db);
      },
    });
  }, 300_000);

  it(`XRT-05, DTT-09 ★ duyệt ĐUA từ chối cùng yêu cầu ⇒ đúng một bên thắng; trạng thái, ví và sổ cái khớp bên thắng (${ROUNDS} vòng)`, async () => {
    const service = adminWithdrawalStack(db);
    await runRounds({
      rounds: ROUNDS,
      setup: setupRequest,
      race: (ctx) => {
        const gate = createGate(2);
        return [
          async () => {
            await gate.arrive();
            return outcomeOf(service.approve(ctx.adminA, ctx.maYeuCau));
          },
          async () => {
            await gate.arrive();
            return outcomeOf(service.reject(ctx.adminB, ctx.maYeuCau));
          },
        ];
      },
      check: async (ctx, results) => {
        const [approve, reject] = settled(results);
        expect([approve, reject].filter((v) => v === true)).toHaveLength(1);
        expect([approve, reject]).toContain('YEU_CAU_DA_XU_LY');
        const approved = approve === true;
        expect(await wf.readWallet(ctx.walletId)).toEqual({
          soDu: approved ? '250000.00' : '350000.00',
          soTienDangGiu: '0.00',
        });
        const status = (
          await db.query<{ t: string }[]>(
            'SELECT trang_thai AS t FROM yeu_cau_rut_tien WHERE yeu_cau_rut_tien_id = ?',
            [ctx.maYeuCau],
          )
        )[0]!.t;
        expect(status).toBe(approved ? 'DaDuyet' : 'TuChoi');
        expect(
          await countOf(
            "SELECT COUNT(*) AS n FROM giao_dich_vi WHERE vi_noi_bo_id = ? AND loai = 'Rut'",
            [ctx.walletId],
          ),
        ).toBe(approved ? 1 : 0);
        await assertWalletInvariants(db);
      },
    });
  }, 300_000);
});
