import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { BookingEligibilityService } from './booking-eligibility.service.js';
// Import GIÁ TRỊ (không `import type`) cho BookingChecksDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không thân không được kiểm
import {
  BookingChecksDto,
  type BookingCheckResult,
  type EligibilityResult,
} from './booking-checks.dto.js';
import { BookingChecksService } from './booking-checks.service.js';

// Hai route kiểm TRƯỚC KHI ĐẶT của Bệnh nhân (task B7; PLAN booking 5.9; TRACKING booking 3.18 B7-C, B7-D). Controller chỉ nhận/trả; logic ở `BookingEligibilityService` và `BookingChecksService`.
//  - `@Roles('BenhNhan')` DUY NHẤT, ghi trên từng route (AR-02, QB-07): mọi vai trò khác nhận 403. Guard chạy TRƯỚC pipe nên người sai vai trò gửi thân sai vẫn nhận 403, không phải 400.
//  - Chủ sở hữu CHỈ lấy từ access token qua `CurrentUser()` (QB-03): `eligibility` không có tham số nào, `checks` không có `benhNhanId` (gửi lên là 400 `TRUONG_KHONG_DUOC_PHEP`).
//  - `@Header('Cache-Control', 'no-store')` (như B2): dữ liệu cá nhân, không cho trình duyệt hay proxy lưu. Nest áp header SAU guard và TRƯỚC pipe, nên 400 do DTO và lỗi nghiệp vụ do dịch vụ ném đều có;
//    401 và 403 do guard thì KHÔNG hứa: guard chạy trước `@Header`. Số đo của B7 (e2e, 11/11/2026): cả hai route, cả 401 lẫn 403 do guard đều KHÔNG có `cache-control` (B3 đã đo 401 như vậy). Không sửa guard và không ghim thiếu sót đó ở test.
//  - Không RequireAdminScope, không OriginGuard: xác thực bằng header Authorization (trình duyệt không tự gửi), không cookie nên không có CSRF. Cả hai route CHỈ ĐỌC.
@Controller('booking')
export class BookingChecksController {
  constructor(
    @Inject(BookingEligibilityService)
    private readonly eligibilityService: BookingEligibilityService,
    @Inject(BookingChecksService)
    private readonly checksService: BookingChecksService,
  ) {}

  // 200 kể cả khi bị khoá no-show: đây là kết quả của cổng, không phải lỗi (A4).
  @Get('eligibility')
  @Roles('BenhNhan')
  @Header('Cache-Control', 'no-store')
  eligibility(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EligibilityResult> {
    return this.eligibilityService.check(user.accountId);
  }

  // `@HttpCode(200)`: `@Post` mặc định trả 201, mà hợp đồng là 200 (kiểm, không tạo gì). Chuyển TƯỜNG MINH từng trường của thân, không truyền nguyên DTO.
  @Post('checks')
  @HttpCode(200)
  @Roles('BenhNhan')
  @Header('Cache-Control', 'no-store')
  checks(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: BookingChecksDto,
  ): Promise<BookingCheckResult> {
    return this.checksService.check(user.accountId, {
      khungGioId: body.khungGioId,
      hoSoNguoiThanId: body.hoSoNguoiThanId ?? null,
    });
  }
}
