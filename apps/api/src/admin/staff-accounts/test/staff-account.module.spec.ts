import 'reflect-metadata';
import { Global, Module, RequestMethod } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AuditModule } from '../../../audit/audit.module.js';
import { AuditService } from '../../../audit/audit.service.js';
import { AuthModule } from '../../../auth/auth.module.js';
import { ROLES_KEY } from '../../../auth/decorators/roles.decorator.js';
import { PasswordHasher } from '../../../auth/password/password-hasher.service.js';
import { UnverifiedPatientCleaner } from '../../../auth/register/unverified-patient-cleaner.js';
import { OriginGuard } from '../../../auth/guards/origin.guard.js';
import { OtpService } from '../../../auth/otp/otp.service.js';
import { RefreshCookieService } from '../../../auth/session/refresh-cookie.service.js';
import { SessionService } from '../../../auth/session/session.service.js';
import { TokenService } from '../../../auth/session/token.service.js';
import { ADMIN_SCOPE_KEY } from '../../../rbac/admin-scope.js';
import { AdminScopeService } from '../../../rbac/admin-scope.service.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { RbacModule } from '../../../rbac/rbac.module.js';
import { auditAdminControllers } from '../../../rbac/testing/admin-route-audit.js';
import { ActivationLinkService } from '../../staff-activation/activation-link.service.js';
import { StaffActivationModule } from '../../staff-activation/staff-activation.module.js';
import { StaffAccountController } from '../staff-account.controller.js';
import { StaffAccountModule } from '../staff-account.module.js';
import { StaffAccountRepository } from '../staff-account.repository.js';
import { StaffAccountService } from '../staff-account.service.js';

// Task B15 (admin) — module tạo tài khoản nhân sự (NS A2, Q32). Mã NSB15-19 là [đề xuất]. Hạ tầng thật (AuthModule, RbacModule, AuditModule,
// StaffActivationModule) cần DB và SMTP nên được thay bằng module giả xuất đúng các lớp mà module này cần.

@Global()
@Module({
  providers: [{ provide: DataSource, useValue: {} }],
  exports: [DataSource],
})
class FakeGlobalInfrastructureModule {}

@Module({
  providers: [{ provide: UnverifiedPatientCleaner, useValue: {} }],
  exports: [UnverifiedPatientCleaner],
})
class FakeAuthModule {}

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

@Module({
  providers: [{ provide: AuditService, useValue: {} }],
  exports: [AuditService],
})
class FakeAuditModule {}

const exportsOf = (moduleClass: object): unknown[] =>
  (Reflect.getMetadata(MODULE_METADATA.EXPORTS, moduleClass) as
    unknown[] | undefined) ?? [];

describe('StaffAccountModule', () => {
  it('NSB15-19 dựng được dịch vụ, kho và controller từ các module nhập vào; không xuất gì', async () => {
    const root = await Test.createTestingModule({
      imports: [FakeGlobalInfrastructureModule, StaffAccountModule],
    })
      .overrideModule(AuthModule)
      .useModule(FakeAuthModule)
      .overrideModule(StaffActivationModule)
      .useModule(FakeStaffActivationModule)
      .overrideModule(RbacModule)
      .useModule(FakeRbacModule)
      .overrideModule(AuditModule)
      .useModule(FakeAuditModule)
      .compile();
    try {
      expect(root.get(StaffAccountService)).toBeInstanceOf(StaffAccountService);
      expect(root.get(StaffAccountRepository)).toBeInstanceOf(
        StaffAccountRepository,
      );
      expect(root.get(StaffAccountController)).toBeInstanceOf(
        StaffAccountController,
      );
      expect(exportsOf(StaffAccountModule)).toEqual([]);
    } finally {
      await root.close();
    }
  });

  it('NSB15-19 nhập đúng bốn module: StaffActivationModule (liên kết), AuthModule (cleaner), RbacModule (phạm vi), AuditModule', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      StaffAccountModule,
    ) as unknown[];
    expect(
      [...imports].sort((a, b) => String(a).localeCompare(String(b))),
    ).toEqual(
      [StaffActivationModule, AuthModule, RbacModule, AuditModule].sort(
        (a, b) => String(a).localeCompare(String(b)),
      ),
    );
  });
});

describe('StaffAccountController (NS A2, PQ-11)', () => {
  it('NSB15-19 đúng một route POST admin/staff-accounts, trả 201 (không đổi mã mặc định), cấp lớp @Roles("QuanTriVien") và @RequireAdminScope("Any")', () => {
    expect(Reflect.getMetadata(PATH_METADATA, StaffAccountController)).toBe(
      'admin/staff-accounts',
    );
    // Đọc hàm qua descriptor để không tham chiếu phương thức chưa gắn `this`
    const handler = Object.getOwnPropertyDescriptor(
      StaffAccountController.prototype,
      'create',
    )?.value as object;
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('/');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, StaffAccountController)).toEqual([
      'QuanTriVien',
    ]);
    expect(Reflect.getMetadata(ADMIN_SCOPE_KEY, StaffAccountController)).toBe(
      'Any',
    );
    const methods = Object.getOwnPropertyNames(
      StaffAccountController.prototype,
    ).filter((name) => name !== 'constructor');
    expect(methods).toEqual(['create']);
  });

  it('NSB15-19 bộ quét controller admin của C1 (auditAdminControllers) không báo lỗi cho controller này', () => {
    expect(auditAdminControllers([StaffAccountController])).toEqual([]);
  });
});

describe('AuthModule xuất UnverifiedPatientCleaner cho B15 (Q32, Đại chọn cách A)', () => {
  it('NSB15-19 exports của AuthModule có cleaner VÀ vẫn giữ nguyên mọi thứ đã xuất trước đó', () => {
    const exported = exportsOf(AuthModule);
    for (const needed of [
      UnverifiedPatientCleaner,
      PasswordHasher,
      TokenService,
      SessionService,
      RefreshCookieService,
      OriginGuard,
      OtpService,
    ]) {
      expect(exported).toContain(needed);
    }
  });
});
