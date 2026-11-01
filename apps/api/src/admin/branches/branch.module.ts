import { Module } from '@nestjs/common';
import { RbacModule } from '../../rbac/rbac.module.js';
import { BranchController } from './branch.controller.js';
import { BranchRepository } from './branch.repository.js';
import { BranchService } from './branch.service.js';

@Module({
  imports: [RbacModule],
  controllers: [BranchController],
  providers: [BranchRepository, BranchService],
})
export class BranchModule {}
