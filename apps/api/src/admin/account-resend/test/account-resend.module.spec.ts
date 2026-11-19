import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AuditModule } from '../../../audit/audit.module.js';
import { AdminScopeService } from '../../../rbac/admin-scope.service.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { RbacModule } from '../../../rbac/rbac.module.js';
import { ActivationLinkService } from '../../staff-activation/activation-link.service.js';
import { StaffActivationModule } from '../../staff-activation/staff-activation.module.js';
import { AccountResendController } from '../account-resend.controller.js';
import { AccountResendModule } from '../account-resend.module.js';
import { AccountResendRepository } from '../account-resend.repository.js';
import { AccountResendService } from '../account-resend.service.js';

// Task B20 (admin) — nối module. Mã TKB20-09 là [đề xuất]. Hạ tầng thật (StaffActivationModule cần SMTP, RbacModule cần DB) được thay bằng module giả
// xuất đúng các lớp mà module này cần.

@Global()
@Module({
  providers: [{ provide: DataSource, useValue: {} }],
  exports: [DataSource],
})
class FakeGlobalInfrastructureModule {}

@Module({
  providers: [{ provide: ActivationLinkService, useValue: {} }],
  exports: [ActivationLinkService],
})
class FakeStaffActivationModule {}

@Module({
  providers: [BranchAccessPolicy, { provide: AdminScopeService, useValue: {} }],
  exports: [BranchAccessPolicy, AdminScopeService],
})
class FakeRbacModule {}

const exportsOf = (moduleClass: object): unknown[] =>
  (Reflect.getMetadata(MODULE_METADATA.EXPORTS, moduleClass) as
    unknown[] | undefined) ?? [];

describe('AccountResendModule (TKB20-09, PQ-11)', () => {
  it('TKB20-09 dựng được dịch vụ, kho và controller từ các module nhập vào; không xuất gì', async () => {
    const root = await Test.createTestingModule({
      imports: [FakeGlobalInfrastructureModule, AccountResendModule],
    })
      .overrideModule(StaffActivationModule)
      .useModule(FakeStaffActivationModule)
      .overrideModule(RbacModule)
      .useModule(FakeRbacModule)
      .compile();
    try {
      expect(root.get(AccountResendService)).toBeInstanceOf(
        AccountResendService,
      );
      expect(root.get(AccountResendRepository)).toBeInstanceOf(
        AccountResendRepository,
      );
      expect(root.get(AccountResendController)).toBeInstanceOf(
        AccountResendController,
      );
      expect(exportsOf(AccountResendModule)).toEqual([]);
    } finally {
      await root.close();
    }
  });

  it('TKB20-09 nhập đúng hai module: StaffActivationModule (liên kết) và RbacModule (phạm vi); KHÔNG nhập AuditModule (không ghi audit, PLAN 5.10)', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AccountResendModule,
    ) as unknown[];
    expect(imports).toHaveLength(2);
    expect(imports).toContain(StaffActivationModule);
    expect(imports).toContain(RbacModule);
    expect(imports).not.toContain(AuditModule);
  });
});
