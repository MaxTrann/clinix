import { Module } from '@nestjs/common';
import { PaymentPolicyModule } from './policy/payment-policy.module.js';
import { PaymentPortsModule } from './ports/payment-ports.module.js';

// `PaymentModule` — vỏ của scope payment (PLAN payment 5.1; payment P4). Đăng ký vào `AppModule` MỘT lần ở đây để các task sau chỉ thêm controller và provider trong `payment/`, không đụng
// lại `app.module.ts` (file dùng chung), và để test kiến trúc QTT-11 canh chiều phụ thuộc ngay từ đầu.
// Đích cuối: `imports: [AppointmentsModule, WalletModule, PaymentPortsModule, RbacModule, AuditModule]`. Mỗi module nhập thêm ở task cần nó (B-task thêm `AppointmentsModule` khi gọi `confirmPaid`;
// P3 thêm `WalletModule`; P5 thêm `AuditModule`): không nhập trước thứ chưa có người dùng. KHÔNG `forwardRef`.
@Module({
  // B10: PaymentPolicyModule (cấu hình chính sách cọc, chỉ cần RbacModule). Task sau thêm module của mình vào cùng mảng này.
  imports: [PaymentPortsModule, PaymentPolicyModule],
})
export class PaymentModule {}
