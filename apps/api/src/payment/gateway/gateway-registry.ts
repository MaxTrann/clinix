import type { TopupGateway } from '../../wallet/wallet.constants.js';
import type { PaymentGatewayPort } from './gateway.port.js';
import { readVnpayConfig } from './vnpay/vnpay-config.js';
import { VnpayGateway } from './vnpay/vnpay.gateway.js';

// Danh bạ các bộ điều hợp cổng thanh toán (payment B4). Nest tạo MỘT bản lúc khởi động bằng `createGatewayRegistry()` (đọc biến môi trường một lần); test truyền thẳng danh sách bộ điều hợp
// (khoá giả) nên không phụ thuộc `.env` của máy. MoMo chưa có bộ điều hợp (B16) ⇒ `find('MoMo')` trả `null`, xử lý như "chưa cấu hình".
export class GatewayRegistry {
  private readonly byName: ReadonlyMap<TopupGateway, PaymentGatewayPort>;

  constructor(gateways: readonly PaymentGatewayPort[]) {
    this.byName = new Map(gateways.map((port) => [port.gateway, port]));
  }

  find(gateway: TopupGateway): PaymentGatewayPort | null {
    return this.byName.get(gateway) ?? null;
  }
}

export function createGatewayRegistry(
  env: Readonly<Record<string, string | undefined>> = process.env,
): GatewayRegistry {
  return new GatewayRegistry([new VnpayGateway(readVnpayConfig(env))]);
}
