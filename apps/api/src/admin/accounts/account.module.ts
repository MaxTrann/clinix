import { Module } from '@nestjs/common';
import { RbacModule } from '../../rbac/rbac.module.js';
import { AccountController } from './account.controller.js';
import { AccountRepository } from './account.repository.js';
import { AccountService } from './account.service.js';

@Module({
  imports: [RbacModule],
  controllers: [AccountController],
  providers: [AccountRepository, AccountService],
})
export class AccountModule {}
