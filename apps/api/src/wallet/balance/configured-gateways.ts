import { TOPUP_GATEWAYS, type TopupGateway } from '../wallet.constants.js';

// Cổng nạp ví ĐÃ CẤU HÌNH, để `GET /patient/wallet` chỉ liệt kê cổng dùng được (PLAN 5.11 #1, SDV-04). Một cổng coi là đã cấu hình khi MỌI biến của nó có giá trị (không rỗng).
// Tên biến `[đề xuất]`: B3 (VNPAY) và B16 (MoMo) chốt tên thật khi thêm bộ điều hợp, khi đó sửa đúng bảng dưới (một chỗ). Chưa cấu hình gì ⇒ danh sách rỗng (web ẩn mục nạp tiền).
const GATEWAY_ENV: Record<TopupGateway, readonly string[]> = {
  VNPay: ['VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET'],
  MoMo: ['MOMO_PARTNER_CODE', 'MOMO_SECRET_KEY'],
};

/** Token của danh sách cổng đã cấu hình; test cấp thẳng một mảng. */
export const CONFIGURED_TOPUP_GATEWAYS = Symbol('CONFIGURED_TOPUP_GATEWAYS');

export function readConfiguredGateways(
  env: Readonly<Record<string, string | undefined>> = process.env,
): TopupGateway[] {
  return TOPUP_GATEWAYS.filter((gateway) =>
    GATEWAY_ENV[gateway].every((name) => (env[name] ?? '').trim() !== ''),
  );
}
