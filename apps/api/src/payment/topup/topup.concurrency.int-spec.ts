import type { DataSource } from 'typeorm';
import {
  createGate,
  runRounds,
} from '../../appointments/testing/concurrency-harness.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { WalletFixtures } from '../../wallet/testing/wallet-fixtures.js';
import { assertWalletInvariants } from '../../wallet/testing/wallet-invariants.js';
import type { GatewayAck } from '../gateway/gateway.port.js';
import { signedVnpayIpn, topupStack } from '../testing/topup-stack.js';
import type { CreateTopupDto } from './topup.dto.js';

// payment B4 — DTT-07: hai IPN ĐỒNG THỜI cho CÙNG một giao dịch nạp trên MySQL 8.4 THẬT (PLAN 5.3, 5.4; số đo M5 của X1). Mỗi vòng dựng Bệnh nhân + giao dịch MỚI, hai bên cùng xuất phát qua
// `createGate`. Vòng lẻ: hai tín hiệu THÀNH CÔNG giống nhau (VNPAY gửi lại khi chưa nhận phản hồi). Vòng chẵn: thành công đua với thất bại (A7: ai khoá trước thắng, bên sau bị bỏ qua).
// Mỗi vòng: ví cộng ĐÚNG số lần bằng 1 nếu dòng kết thúc `ThanhCong`, 0 nếu `ThatBai`; hai phản hồi là một `00` và một `02` (không `99`: không 1213, 1205 hay lỗi lạ nào lọt ra); bất biến ví IVT đúng.
// CHẠY MỘT MÌNH (nhạy với tải máy).
const ROUNDS = 200;

let db: DataSource;
let wf: WalletFixtures;
useIntegrationHooks((d) => {
  db = d;
  wf = new WalletFixtures(d);
});

const one = async <T>(sql: string, params: unknown[]) =>
  (await db.query<T[]>(sql, params))[0]!;

describe('IPN đồng thời (payment B4)', () => {
  it(`DTT-07 hai IPN đồng thời cùng giao dịch ⇒ cộng đúng một lần (${ROUNDS} vòng)`, async () => {
    const { topups, ipn } = topupStack(db);
    let successWins = 0;
    await runRounds<
      { id: string; walletId: string; mixed: boolean },
      GatewayAck | null
    >({
      rounds: ROUNDS,
      setup: async (round) => {
        const { patientId, walletId } = await wf.patientWithWallet();
        const { maGiaoDich } = await topups.create(
          patientId,
          { soTien: '100000', phuongThuc: 'VNPay' } as CreateTopupDto,
          '127.0.0.1',
        );
        return { id: maGiaoDich, walletId, mixed: round % 2 === 0 };
      },
      race: ({ id, mixed }) => {
        const gate = createGate(2);
        const success = signedVnpayIpn({ giaoDichId: id, soTien: '100000.00' });
        const second = mixed
          ? signedVnpayIpn({ giaoDichId: id, soTien: '100000.00', ok: false })
          : success;
        return [success, second].map((signal) => async () => {
          await gate.arrive();
          return ipn.handle('VNPay', signal);
        });
      },
      check: async ({ id, walletId }, results) => {
        const codes = results.map((r) =>
          r.status === 'fulfilled'
            ? r.value?.RspCode
            : `lỗi: ${String(r.reason)}`,
        );
        expect(
          codes.toSorted((x, y) => String(x).localeCompare(String(y))),
        ).toEqual(['00', '02']);
        const row = await one<{ trangThai: string }>(
          'SELECT trang_thai AS trangThai FROM giao_dich_thanh_toan WHERE giao_dich_thanh_toan_id = ?',
          [id],
        );
        const nap = await one<{ n: string }>(
          "SELECT COUNT(*) AS n FROM giao_dich_vi WHERE giao_dich_thanh_toan_id = ? AND loai = 'Nap'",
          [id],
        );
        const expected = row.trangThai === 'ThanhCong' ? 1 : 0;
        if (expected === 1) successWins += 1;
        expect(Number(nap.n)).toBe(expected);
        expect(await wf.readWallet(walletId)).toMatchObject({
          soDu: expected === 1 ? '100000.00' : '0.00',
        });
        await assertWalletInvariants(db);
      },
    });
    // Vòng lẻ luôn thành công; vòng chẵn tuỳ ai khoá trước. In số liệu để ghi TRACKING.
    console.log(
      `[B4-DTT-07] ${ROUNDS} vòng, dòng kết thúc ThanhCong: ${successWins}`,
    );
    expect(successWins).toBeGreaterThanOrEqual(ROUNDS / 2);
  }, 600_000);
});
