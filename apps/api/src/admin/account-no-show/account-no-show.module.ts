import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module.js';
import { RbacModule } from '../../rbac/rbac.module.js';
import { AccountNoShowController } from './account-no-show.controller.js';
import { AccountNoShowRepository } from './account-no-show.repository.js';
import { AccountNoShowService } from './account-no-show.service.js';

// Mở khoá no-show của Bệnh nhân (admin B19). Module riêng, không sửa `AccountModule` của B17 (B17 không xuất gì qua module):
// chỉ dùng lại hàm phạm vi `accountVisibility` và `AccountIdDto` của B17 bằng import tương đối.
@Module({
  imports: [RbacModule, AuditModule],
  controllers: [AccountNoShowController],
  providers: [AccountNoShowRepository, AccountNoShowService],
})
export class AccountNoShowModule {}
