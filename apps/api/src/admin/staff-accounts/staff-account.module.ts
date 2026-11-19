import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { RbacModule } from '../../rbac/rbac.module.js';
import { StaffActivationModule } from '../staff-activation/staff-activation.module.js';
import { StaffAccountController } from './staff-account.controller.js';
import { StaffAccountRepository } from './staff-account.repository.js';
import { StaffAccountService } from './staff-account.service.js';

// Tạo tài khoản nhân sự (task B15). `StaffActivationModule` (B14) xuất ActivationLinkService; `AuthModule` xuất UnverifiedPatientCleaner (Q32, Đại chọn
// cách xuất một dòng ngày 19/11/2026); `RbacModule` xuất BranchAccessPolicy và guard phạm vi; `AuditModule` xuất AuditService.
// DataSource là toàn cục (TypeOrmModule.forRoot). Đặt thư mục riêng `staff-accounts/` để không chung file với B17 (`accounts/`).
@Module({
  imports: [StaffActivationModule, AuthModule, RbacModule, AuditModule],
  controllers: [StaffAccountController],
  providers: [StaffAccountRepository, StaffAccountService],
})
export class StaffAccountModule {}
