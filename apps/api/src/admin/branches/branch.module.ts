import { Module } from '@nestjs/common';
import { RbacModule } from '../../rbac/rbac.module.js';
import { BranchController } from './branch.controller.js';
import { BranchRepository } from './branch.repository.js';
import { BranchService } from './branch.service.js';
import { BranchImpactService } from './impact/branch-impact.service.js';

@Module({
  imports: [RbacModule],
  controllers: [BranchController],
  // BranchImpactService export để B10 (duyệt) và B11 (áp dụng) tính lại ảnh hưởng với mốc hieu_luc_tu;
  // BranchRepository export để job B11 khoá chi nhánh và ghi lịch/dịch vụ bằng đúng các câu SQL của B8 (không viết lần hai)
  providers: [BranchRepository, BranchService, BranchImpactService],
  exports: [BranchImpactService, BranchRepository],
})
export class BranchModule {}
