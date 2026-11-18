import { Module } from '@nestjs/common';
import { SystemConfigModule } from '../admin/system-config/system-config.module.js';
import { AppointmentsModule } from '../appointments/appointments.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { CashPaymentController } from './cash/cash-payment.controller.js';
import { CashPaymentService } from './cash/cash-payment.service.js';
import { CashRepository } from './cash/cash.repository.js';
import { DepositPaymentController } from './deposit/deposit-payment.controller.js';
import { DepositPaymentService } from './deposit/deposit-payment.service.js';
import { DepositRepository } from './deposit/deposit.repository.js';
import {
  createGatewayRegistry,
  GatewayRegistry,
} from './gateway/gateway-registry.js';
import { IpnService } from './gateway/ipn/ipn.service.js';
import { VnpayIpnController } from './gateway/ipn/vnpay-ipn.controller.js';
import { PaymentPolicyModule } from './policy/payment-policy.module.js';
import { PaymentPortsModule } from './ports/payment-ports.module.js';
import { PatientTopupController } from './topup/patient-topup.controller.js';
import { TopupNotifier } from './topup/topup-notifier.js';
import { TopupRepository } from './topup/topup.repository.js';
import { TopupService } from './topup/topup.service.js';

// `PaymentModule` — vỏ của scope payment (PLAN payment 5.1; payment P4). Đăng ký vào `AppModule` MỘT lần ở đây để các task sau chỉ thêm controller và provider trong `payment/`, không đụng
// lại `app.module.ts` (file dùng chung), và để test kiến trúc QTT-11 canh chiều phụ thuộc ngay từ đầu.
// Đích cuối: `imports: [AppointmentsModule, WalletModule, PaymentPortsModule, RbacModule, AuditModule]`. Mỗi module nhập thêm ở task cần nó (không nhập trước thứ chưa có người dùng): B5 nhập
// `AppointmentsModule` (gọi `confirmPaid`) và `WalletModule` (`WalletLedger`, `WalletBalanceReader`); P5 sẽ thêm `AuditModule`. KHÔNG `forwardRef`: `AppointmentsModule` chỉ nhập hai module LÁ (B7, Đại).
// B5: `deposit/` (hai route thanh toán cọc bằng ví). B10: `PaymentPolicyModule`. B6: `cash/` (thu tiền mặt tại quầy) nhập `RbacModule` (chi nhánh của Lễ tân) và `SystemConfigModule` (cửa sổ tiếp đón);
// cả hai là module lá, không nhập ngược `PaymentModule`.
// B4: `topup/` (tạo nạp ví, xem trạng thái) và `gateway/ipn/` (IPN của VNPAY); `GatewayRegistry` tạo MỘT lần lúc khởi động từ biến môi trường (thiếu biến ⇒ cổng "chưa cấu hình", API vẫn chạy).
@Module({
  imports: [
    AppointmentsModule,
    WalletModule,
    PaymentPortsModule,
    PaymentPolicyModule,
    RbacModule,
    SystemConfigModule,
  ],
  controllers: [
    DepositPaymentController,
    CashPaymentController,
    PatientTopupController,
    VnpayIpnController,
  ],
  providers: [
    DepositRepository,
    DepositPaymentService,
    CashRepository,
    CashPaymentService,
    TopupRepository,
    TopupService,
    TopupNotifier,
    IpnService,
    { provide: GatewayRegistry, useFactory: () => createGatewayRegistry() },
  ],
})
export class PaymentModule {}
