import {
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { Public } from '../../../auth/decorators/public.decorator.js';
import type { GatewayAck } from '../gateway.port.js';
import { IpnService } from './ipn.service.js';

// IPN của VNPAY (payment B4; PLAN 5.4, 5.11 #5; CGS-13, CGS-15). VNPAY gọi bằng GET, KHÔNG có phiên đăng nhập: `@Public`, xác thực bằng CHỮ KÝ (`verifyIpn`). Luôn trả 200 kèm
// `{ RspCode, Message }` đúng định dạng VNPAY (mã lỗi nằm trong thân, không trong HTTP status).
//  - `@Query()` kiểu bản ghi thường (không DTO): ValidationPipe toàn cục bỏ qua, nên tham số lạ của VNPAY không bị 400. `verifyIpn` tự xử lý mọi dạng (mảng, chuỗi rỗng…) không ném lỗi.
//  - `no-store`: phản hồi không được bộ đệm nào giữ lại.
//  - Route nằm trong `PUBLIC_ROUTE_ALLOWLIST` của test kiến trúc (QTT-01).
@Controller('payment/ipn')
export class VnpayIpnController {
  constructor(@Inject(IpnService) private readonly ipn: IpnService) {}

  @Get('vnpay')
  @Public()
  @Header('Cache-Control', 'no-store')
  async receive(@Query() query: Record<string, unknown>): Promise<GatewayAck> {
    const ack = await this.ipn.handle('VNPay', query);
    // Không bao giờ xảy ra khi VNPAY có bộ điều hợp; giữ cho kiểu chặt
    if (ack === null) throw new NotFoundException();
    return ack;
  }
}
