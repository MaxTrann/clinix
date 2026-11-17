import { Controller, Get, Header, Query } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator.js';
import { PUBLIC_ROUTE_PREFIX } from '../search.constants.js';
import {
  PublicSlotQueryDto,
  type PublicSlotsResponse,
} from './public-slot.dto.js';
import { PublicSlotService } from './public-slot.service.js';

// Route công khai: không đọc token, không @Roles, chỉ GET (PLAN 5.2). Đường dẫn RIÊNG (không dưới `public/doctors/`) để `GET public/doctors/:id` không bắt nhầm `slots`.
// `no-store`: khung giờ đổi liên tục và "đang giữ chỗ" tự hết hạn theo thời gian. Nest áp header SAU guard và TRƯỚC pipe nên 400 cũng có.
@Controller(`${PUBLIC_ROUTE_PREFIX}/doctor-slots`)
@Public()
export class PublicSlotController {
  constructor(private readonly slots: PublicSlotService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: PublicSlotQueryDto): Promise<PublicSlotsResponse> {
    return this.slots.list(query);
  }
}
