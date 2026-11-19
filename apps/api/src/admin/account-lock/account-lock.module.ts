import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { RbacModule } from '../../rbac/rbac.module.js';
import { AccountLockController } from './account-lock.controller.js';
import { AccountLockRepository } from './account-lock.repository.js';
import { AccountLockService } from './account-lock.service.js';

// Khoá / mở khoá tài khoản (admin B18). Không xuất gì: B19, B20 có module riêng. `AuthModule` xuất `SessionService` (thu hồi phiên, Q29).
@Module({
  imports: [RbacModule, AuditModule, AuthModule],
  controllers: [AccountLockController],
  providers: [AccountLockRepository, AccountLockService],
})
export class AccountLockModule {}
