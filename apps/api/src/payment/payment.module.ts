import { Module } from '@nestjs/common';
import { PaymentPortsModule } from './ports/payment-ports.module.js';

// `PaymentModule` — vỏ của scope payment (PLAN payment 5.1; payment P4). Đăng ký vào `AppModule` MỘT lần ở đây để các task sau chỉ thêm controller và provider trong `payment/`, không đụng
// lại `app.module.ts` (file dùng chung), và để test kiến trúc QTT-11 canh chiều phụ thuộc ngay từ đầu.
// Đích cuối: `imports: [AppointmentsModule, WalletModule, PaymentPortsModule, RbacModule, AuditModule]`. Mỗi module nhập thêm ở task cần nó (B-task thêm `AppointmentsModule` khi gọi `confirmPaid`;
// P3 thêm `WalletModule`; P5 thêm `AuditModule`): không nhập trước thứ chưa có người dùng. KHÔNG `forwardRef`.
@Module({
  imports: [PaymentPortsModule],
})
export class PaymentModule {}
