import { Module } from '@nestjs/common';
import { AdminMeController } from './admin-me.controller.js';
import { AdminScopeRepository } from './admin-scope.repository.js';
import { AdminScopeService } from './admin-scope.service.js';
import { BranchAccessPolicy } from './branch-access.policy.js';
import { AdminScopeGuard } from './guards/admin-scope.guard.js';

@Module({
  controllers: [AdminMeController],
  providers: [
    AdminScopeRepository,
    AdminScopeService,
    AdminScopeGuard,
    BranchAccessPolicy,
  ],
  exports: [AdminScopeService, AdminScopeGuard, BranchAccessPolicy],
})
export class RbacModule {}
