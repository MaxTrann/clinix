import { Module } from '@nestjs/common';
import { RbacModule } from '../../rbac/rbac.module.js';
import { StaffActivationModule } from '../staff-activation/staff-activation.module.js';
import { AccountResendController } from './account-resend.controller.js';
import { AccountResendRepository } from './account-resend.repository.js';
import { AccountResendService } from './account-resend.service.js';

// Gửi lại liên kết kích hoạt (admin B20). `StaffActivationModule` (B14) xuất ActivationLinkService; `RbacModule` xuất BranchAccessPolicy và guard phạm vi.
// Không import AuditModule: thao tác này không ghi audit (PLAN 5.10 không có giá trị cho "gửi lại"). DataSource là toàn cục (TypeOrmModule.forRoot).
// Module riêng, không sửa `AccountModule` của B17 hay `StaffActivationModule` của B14: chỉ dùng lại hàm phạm vi `accountVisibility` và `AccountIdDto` của B17.
@Module({
  imports: [StaffActivationModule, RbacModule],
  controllers: [AccountResendController],
  providers: [AccountResendRepository, AccountResendService],
})
export class AccountResendModule {}
