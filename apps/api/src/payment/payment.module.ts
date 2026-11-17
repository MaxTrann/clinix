import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { DepositPaymentController } from './deposit/deposit-payment.controller.js';
import { DepositPaymentService } from './deposit/deposit-payment.service.js';
import { DepositRepository } from './deposit/deposit.repository.js';
import { PaymentPortsModule } from './ports/payment-ports.module.js';

// `PaymentModule` — vỏ của scope payment (PLAN payment 5.1; payment P4). Đăng ký vào `AppModule` MỘT lần ở đây để các task sau chỉ thêm controller và provider trong `payment/`, không đụng
// lại `app.module.ts` (file dùng chung), và để test kiến trúc QTT-11 canh chiều phụ thuộc ngay từ đầu.
// Đích cuối: `imports: [AppointmentsModule, WalletModule, PaymentPortsModule, RbacModule, AuditModule]`. Mỗi module nhập thêm ở task cần nó (không nhập trước thứ chưa có người dùng): B5 nhập
// `AppointmentsModule` (gọi `confirmPaid`) và `WalletModule` (`WalletLedger`, `WalletBalanceReader`); P5 sẽ thêm `AuditModule`. KHÔNG `forwardRef`: `AppointmentsModule` chỉ nhập hai module LÁ (B7, Đại).
// B5: `deposit/` (hai route thanh toán cọc bằng ví).
@Module({
  imports: [AppointmentsModule, WalletModule, PaymentPortsModule],
  controllers: [DepositPaymentController],
  providers: [DepositRepository, DepositPaymentService],
})
export class PaymentModule {}
