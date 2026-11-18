import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AuthModule } from '../../../auth/auth.module.js';
import { PasswordHasher } from '../../../auth/password/password-hasher.service.js';
import { ActivationLinkRepository } from '../activation-link.repository.js';
import { StaffActivationModule } from '../staff-activation.module.js';
import { StaffActivationController } from '../staff-activation.controller.js';
import { StaffActivationPublicModule } from '../staff-activation-public.module.js';
import { StaffActivationRepository } from '../staff-activation.repository.js';
import { StaffActivationService } from '../staff-activation.service.js';

// Task B16 (admin) — module kích hoạt công khai dựng được dịch vụ với PasswordHasher của auth, DataSource toàn cục; không xuất gì và KHÔNG đổi hợp đồng của
// StaffActivationModule (B14, NSB14-24). Mã NSB16-12 là [đề xuất]. AuthModule thật cần cả DB nên được thay bằng module giả xuất PasswordHasher.
@Global()
@Module({
  providers: [{ provide: DataSource, useValue: {} }],
  exports: [DataSource],
})
class FakeGlobalInfrastructureModule {}

@Module({
  providers: [{ provide: PasswordHasher, useValue: {} }],
  exports: [PasswordHasher],
})
class FakeAuthModule {}

describe('StaffActivationPublicModule', () => {
  it('NSB16-12 dựng được StaffActivationService (PasswordHasher từ AuthModule, DataSource toàn cục) và controller; không xuất gì', async () => {
    const root = await Test.createTestingModule({
      imports: [FakeGlobalInfrastructureModule, StaffActivationPublicModule],
    })
      .overrideModule(AuthModule)
      .useModule(FakeAuthModule)
      .compile();
    try {
      expect(root.get(StaffActivationService)).toBeInstanceOf(
        StaffActivationService,
      );
      expect(root.get(StaffActivationController)).toBeInstanceOf(
        StaffActivationController,
      );
      expect(root.get(StaffActivationRepository)).toBeInstanceOf(
        StaffActivationRepository,
      );
      expect(root.get(ActivationLinkRepository)).toBeInstanceOf(
        ActivationLinkRepository,
      );
      expect(
        Reflect.getMetadata('exports', StaffActivationPublicModule),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata('imports', StaffActivationPublicModule),
      ).toEqual([AuthModule]);
    } finally {
      await root.close();
    }
  });

  it('NSB16-12 module của B14 KHÔNG nhập AuthModule và không có controller (hợp đồng của B15, B20 giữ nguyên)', () => {
    const imports = Reflect.getMetadata('imports', StaffActivationModule) as
      unknown[] | undefined;
    expect(imports ?? []).not.toContain(AuthModule);
    expect(
      Reflect.getMetadata('controllers', StaffActivationModule),
    ).toBeUndefined();
  });
});
