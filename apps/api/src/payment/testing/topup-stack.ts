import type { DataSource } from 'typeorm';
import { WalletLedger } from '../../wallet/ledger/wallet-ledger.js';
import { GatewayRegistry } from '../gateway/gateway-registry.js';
import { IpnService } from '../gateway/ipn/ipn.service.js';
import type { VnpayConfig } from '../gateway/vnpay/vnpay-config.js';
import { signVnpay } from '../gateway/vnpay/vnpay-signature.js';
import { VnpayGateway } from '../gateway/vnpay/vnpay.gateway.js';
import { TopupNotifier } from '../topup/topup-notifier.js';
import { TopupRepository } from '../topup/topup.repository.js';
import { TopupService } from '../topup/topup.service.js';

// Hạ tầng test của nạp ví (payment B4): `TopupService` và `IpnService` THẬT với `VnpayGateway` THẬT cấu hình bằng KHOÁ GIẢ (không đọc `.env`, không mạng). Dựng bằng tay (không qua Nest) để test chủ động
// bọc `DataSource`. Gom một chỗ vì int-spec, int-spec đồng thời và e2e cùng cần.

/** Cấu hình VNPAY GIẢ cho test. KHÔNG phải tài khoản sandbox thật. */
export const FAKE_VNPAY_CONFIG: VnpayConfig = {
  tmnCode: 'TESTTMN1',
  hashSecret: 'KHOA_GIA_CHI_DE_TEST',
  payUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  returnUrl: 'http://localhost:5173/ket-qua-nap-tien',
};

/** Biến môi trường tương ứng `FAKE_VNPAY_CONFIG` (cho e2e dựng `AppModule`). */
export const FAKE_VNPAY_ENV = {
  VNPAY_TMN_CODE: FAKE_VNPAY_CONFIG.tmnCode,
  VNPAY_HASH_SECRET: FAKE_VNPAY_CONFIG.hashSecret,
  VNPAY_PAY_URL: FAKE_VNPAY_CONFIG.payUrl,
  VNPAY_RETURN_URL: FAKE_VNPAY_CONFIG.returnUrl,
} as const;

export function topupStack(
  db: DataSource,
  options: { vnpay?: VnpayConfig | null } = {},
) {
  const gateway = new VnpayGateway(
    options.vnpay === undefined ? FAKE_VNPAY_CONFIG : options.vnpay,
  );
  const registry = new GatewayRegistry([gateway]);
  const repository = new TopupRepository();
  const topups = new TopupService(db, repository, registry);
  const ipn = new IpnService(
    db,
    registry,
    repository,
    new WalletLedger(),
    new TopupNotifier(),
  );
  return { topups, ipn, gateway, repository };
}

/**
 * Tham số IPN VNPAY đã KÝ bằng khoá giả, theo bộ tham số đo thật (M12). `soTien` là chuỗi đồng ("50000.00"); `ok = false` ⇒ tín hiệu huỷ như số đo (`24`/`02`, `vnp_TransactionNo = "0"`).
 * `patch` sửa TRƯỚC khi ký (tham số vẫn có chữ ký đúng).
 */
export function signedVnpayIpn(
  input: {
    giaoDichId: string;
    soTien: string;
    ok?: boolean;
    transactionNo?: string;
  },
  patch: Record<string, string> = {},
): Record<string, string> {
  const ok = input.ok ?? true;
  const [whole = '0', fraction = '00'] = input.soTien.split('.');
  const params: Record<string, string> = {
    vnp_TmnCode: FAKE_VNPAY_CONFIG.tmnCode,
    vnp_Amount: `${whole}${fraction.padEnd(2, '0')}`.replace(/^0+(?=\d)/, ''),
    vnp_BankCode: ok ? 'NCB' : 'VNPAY',
    vnp_CardType: 'ATM',
    vnp_OrderInfo: 'Nap tien vao vi CLINIX',
    vnp_PayDate: '20261102080500',
    vnp_ResponseCode: ok ? '00' : '24',
    vnp_TransactionStatus: ok ? '00' : '02',
    vnp_TransactionNo:
      input.transactionNo ?? (ok ? `9${input.giaoDichId}` : '0'),
    vnp_TxnRef: input.giaoDichId,
    ...(ok ? { vnp_BankTranNo: `VNP${input.giaoDichId}` } : {}),
    ...patch,
  };
  return {
    ...params,
    vnp_SecureHash: signVnpay(params, FAKE_VNPAY_CONFIG.hashSecret),
  };
}
