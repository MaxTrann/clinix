import { Module } from '@nestjs/common';
import { PaymentChain } from './payment-chain.js';

// `PaymentPortsModule` — module LÁ của scope payment (PLAN payment 5.1, Q2, Q22): chứa phần dùng chung giữa `payment` và `wallet` mà `AppointmentsModule` cũng cần. KHÔNG nhập
// `AppointmentsModule`, `PaymentModule` hay `WalletModule` (QTT-08, QTT-11; không `forwardRef`, HDT-11): `AppointmentsModule` sẽ nhập nó ở task B17a, và `WalletModule` nhập nó một chiều (P3).
// P4 chỉ có `PaymentChain`. Bản thật của `PaymentPort` (`PaymentRecorder`) và `PaymentSummaryPort` (`PaymentSummaryReader`) thêm vào đây ở task B2; `DataSource` có sẵn toàn cục
// từ `DatabaseModule` nên chưa cần `imports`.
@Module({
  providers: [PaymentChain],
  exports: [PaymentChain],
})
export class PaymentPortsModule {}
