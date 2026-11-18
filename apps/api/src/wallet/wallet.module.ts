import { Module } from '@nestjs/common';
import { PaymentPortsModule } from '../payment/ports/payment-ports.module.js';
import {
  CONFIGURED_TOPUP_GATEWAYS,
  readConfiguredGateways,
} from './balance/configured-gateways.js';
import { PatientWalletController } from './balance/patient-wallet.controller.js';
import { PatientWalletService } from './balance/patient-wallet.service.js';
import { WalletBalanceReader } from './balance/wallet-balance.reader.js';
import { WalletBalanceRepository } from './balance/wallet-balance.repository.js';
import { WalletLedger } from './ledger/wallet-ledger.js';
import { RefundNotifier } from './refund/refund-notifier.js';
import { RefundRepository } from './refund/refund.queries.js';
import { RefundRetryJob } from './refund/refund-retry.job.js';
import { RefundService } from './refund/refund.service.js';
import { PatientWithdrawalController } from './withdrawal/patient-withdrawal.controller.js';
import { WithdrawalNotifier } from './withdrawal/withdrawal-notifier.js';
import { WithdrawalRepository } from './withdrawal/withdrawal.repository.js';
import { WithdrawalService } from './withdrawal/withdrawal.service.js';

// `WalletModule` — module LÁ của scope wallet (PLAN payment 5.1, Q2, Q22; payment P3): sở hữu sổ ví (`WalletLedger`: cộng, trừ, giữ, nhả). Nhập `PaymentPortsModule` MỘT CHIỀU (để dùng `PaymentChain` khi hoàn tiền); KHÔNG
// nhập `AppointmentsModule` hay `PaymentModule` (QTT-08, QTT-11; không `forwardRef`, HDT-11). `AppointmentsModule` sẽ nhập module này ở task B17a; `PaymentModule` nhập ở task cần ví.
// Task nào thêm gì: P3 `WalletLedger`; B1 `balance/` (`WalletBalanceReader`, hai route đọc ví); B8, B9 `RefundService`; B11 trở đi rút tiền và hoàn đặc biệt. `DataSource` có sẵn toàn cục từ `DatabaseModule` nên chưa cần `imports` khác.
@Module({
  imports: [PaymentPortsModule],
  controllers: [PatientWalletController, PatientWithdrawalController],
  providers: [
    WalletLedger,
    WalletBalanceRepository,
    PatientWalletService,
    WalletBalanceReader,
    // B8: hoàn cọc tự động (RefundService = bản thật của RefundPort; B9 của Đại nối vào AppointmentsModule bằng useExisting) và job thử lại mỗi phút
    RefundRepository,
    RefundNotifier,
    RefundService,
    RefundRetryJob,
    // B11: Bệnh nhân gửi yêu cầu rút tiền (giữ tiền, chưa ghi sổ cái)
    WithdrawalRepository,
    WithdrawalNotifier,
    WithdrawalService,
    // Cổng nạp đã cấu hình theo môi trường (B3, B16 chốt tên biến thật)
    {
      provide: CONFIGURED_TOPUP_GATEWAYS,
      useFactory: () => readConfiguredGateways(),
    },
  ],
  exports: [WalletLedger, WalletBalanceReader, RefundService],
})
export class WalletModule {}
