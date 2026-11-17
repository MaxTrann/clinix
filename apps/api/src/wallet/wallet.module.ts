import { Module } from '@nestjs/common';
import { PaymentPortsModule } from '../payment/ports/payment-ports.module.js';
import { WalletLedger } from './ledger/wallet-ledger.js';

// `WalletModule` — module LÁ của scope wallet (PLAN payment 5.1, Q2, Q22; payment P3): sở hữu sổ ví (`WalletLedger`: cộng, trừ, giữ, nhả). Nhập `PaymentPortsModule` MỘT CHIỀU (để dùng `PaymentChain` khi hoàn tiền); KHÔNG
// nhập `AppointmentsModule` hay `PaymentModule` (QTT-08, QTT-11; không `forwardRef`, HDT-11). `AppointmentsModule` sẽ nhập module này ở task B17a; `PaymentModule` nhập ở task cần ví.
// Task nào thêm gì: P3 `WalletLedger`; B1 `WalletBalanceReader`; B8, B9 `RefundService`; B11 trở đi rút tiền và hoàn đặc biệt. `DataSource` có sẵn toàn cục từ `DatabaseModule` nên chưa cần `imports` khác.
@Module({
  imports: [PaymentPortsModule],
  providers: [WalletLedger],
  exports: [WalletLedger],
})
export class WalletModule {}
