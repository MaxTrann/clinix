import { Module } from '@nestjs/common';
import { PaymentChain } from './payment-chain.js';
import { PaymentRecorder } from './payment-recorder.js';
import { PaymentSummaryReader } from './payment-summary.reader.js';

// `PaymentPortsModule` — module LÁ của scope payment (PLAN payment 5.1, Q2, Q22): chứa phần dùng chung giữa `payment` và `wallet` mà `AppointmentsModule` cũng cần. KHÔNG nhập
// `AppointmentsModule`, `PaymentModule` hay `WalletModule` (QTT-08, QTT-11; không `forwardRef`, HDT-11): `AppointmentsModule` sẽ nhập nó ở task B17a, và `WalletModule` nhập nó một chiều (P3).
// P4: `PaymentChain`. B2: bản thật của `PaymentPort` (`PaymentRecorder`) và `PaymentSummaryPort` (`PaymentSummaryReader`); cả ba lớp được `exports` để B7 (Đại) nối bằng `useExisting`.
// `DataSource` có sẵn toàn cục từ `DatabaseModule` nên chưa cần `imports`.
@Module({
  providers: [PaymentChain, PaymentRecorder, PaymentSummaryReader],
  exports: [PaymentChain, PaymentRecorder, PaymentSummaryReader],
})
export class PaymentPortsModule {}
