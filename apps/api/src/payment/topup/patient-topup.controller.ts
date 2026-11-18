import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Ip,
  Param,
  Post,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { ParseRecordIdPipe } from '../../doctor/common/parse-record-id.pipe.js';
// Import GIÁ TRỊ (không `import type`) cho CreateTopupDto: ValidationPipe cần metadata của lớp lúc chạy
import {
  CreateTopupDto,
  type CreateTopupResult,
  type TopupStatus,
} from './topup.dto.js';
import { TopupService } from './topup.service.js';

// Nạp ví của Bệnh nhân (payment B4; PLAN 5.11 #3, #4). Controller chỉ nhận/trả; logic ở `TopupService`.
//  - `@Roles('BenhNhan')` trên từng route; chủ ví CHỈ lấy từ access token (thân không nhận `viNoiBoId`, `benhNhanId`).
//  - `Cache-Control: no-store`: giao dịch tài chính cá nhân.
//  - `maGiaoDich` qua `ParseRecordIdPipe` của doctor (tái dùng, không viết lần hai): sai dạng ⇒ CÙNG 404 với không tồn tại (QTT-13).
//  - IP khách lấy bằng `@Ip()` (Express `req.ip`, `trust proxy = 1` ở `app.setup.ts`): VNPAY bắt buộc `vnp_IpAddr`. Cách lấy IP sau proxy thật chưa đo (M13).
@Controller('patient/wallet/topups')
export class PatientTopupController {
  constructor(@Inject(TopupService) private readonly service: TopupService) {}

  @Post()
  @Roles('BenhNhan')
  @Header('Cache-Control', 'no-store')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTopupDto,
    @Ip() ip: string,
  ): Promise<CreateTopupResult> {
    return this.service.create(user.accountId, dto, ip);
  }

  @Get(':maGiaoDich')
  @Roles('BenhNhan')
  @Header('Cache-Control', 'no-store')
  find(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maGiaoDich', ParseRecordIdPipe) maGiaoDich: string,
  ): Promise<TopupStatus> {
    return this.service.find(user.accountId, maGiaoDich);
  }
}
