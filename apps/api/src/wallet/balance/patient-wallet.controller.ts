import { Controller, Get, Header, Inject, Query } from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
// Import GIÁ TRỊ (không `import type`) cho WalletTransactionsQueryDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không query không được kiểm
import {
  WalletTransactionsQueryDto,
  type WalletOverview,
  type WalletTransactionsPage,
} from './wallet-balance.dto.js';
import { PatientWalletService } from './patient-wallet.service.js';

// `GET /patient/wallet` và `GET /patient/wallet/transactions` (payment B1; PLAN 5.11 #1, #2). Controller chỉ nhận/trả; logic ở `PatientWalletService`.
//  - `@Roles('BenhNhan')` GHI TRÊN từng route (QTT-01, QTT-05): vai trò khác nhận 403. Guard chạy TRƯỚC pipe nên người sai vai trò gửi query sai vẫn nhận 403, không phải 400.
//  - Chủ ví CHỈ lấy từ access token (`user.accountId`); query không có `benhNhanId` (gửi lên là 400 `TRUONG_KHONG_DUOC_PHEP`: QTT-03).
//  - `Cache-Control: no-store` áp SAU guard và TRƯỚC pipe nên 400 do query cũng có (QTT-12): đây là số dư và giao dịch tài chính của người dùng.
@Controller('patient/wallet')
export class PatientWalletController {
  constructor(
    @Inject(PatientWalletService)
    private readonly service: PatientWalletService,
  ) {}

  @Get()
  @Roles('BenhNhan')
  @Header('Cache-Control', 'no-store')
  overview(@CurrentUser() user: AuthenticatedUser): Promise<WalletOverview> {
    return this.service.overview(user.accountId);
  }

  @Get('transactions')
  @Roles('BenhNhan')
  @Header('Cache-Control', 'no-store')
  transactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WalletTransactionsQueryDto,
  ): Promise<WalletTransactionsPage> {
    // Chuyển TƯỜNG MINH từng giá trị; `offset` là getter của DTO nên phải lấy ra tại đây
    return this.service.transactions(user.accountId, {
      trang: query.trang,
      kichThuoc: query.kichThuoc,
      offset: query.offset,
      loai: query.loai,
    });
  }
}
