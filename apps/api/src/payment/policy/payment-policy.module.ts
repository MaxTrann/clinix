import { Module } from '@nestjs/common';
import { RbacModule } from '../../rbac/rbac.module.js';
import { PaymentPolicyController } from './payment-policy.controller.js';
import { PaymentPolicyService } from './payment-policy.service.js';
import { PaymentPolicyRepository } from './policy.repository.js';

// Module cấu hình chính sách cọc (payment B10). Chỉ cần `RbacModule` (phạm vi Quản trị viên): không nhập `AppointmentsModule`, `WalletModule` hay `AuditModule`
// (không nhật ký: 2.4 CSD không yêu cầu). `PaymentModule` nhập module này.
@Module({
  imports: [RbacModule],
  controllers: [PaymentPolicyController],
  providers: [PaymentPolicyRepository, PaymentPolicyService],
})
export class PaymentPolicyModule {}
