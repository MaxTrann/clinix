import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { createTestConfigService } from '../../../auth/testing/auth-test-config.js';
import { MailService } from '../../../mail/mail.service.js';
import { FakeMailService } from '../../../mail/testing/fake-mail.service.js';
import { ActivationLinkRepository } from '../activation-link.repository.js';
import { ActivationLinkService } from '../activation-link.service.js';
import { StaffActivationModule } from '../staff-activation.module.js';

// Task B14 (admin) — module khởi tạo được dịch vụ và chỉ xuất ActivationLinkService (B15, B16, B20 import module này). Mã NSB14-24 là [đề xuất].
// DataSource và ConfigService là toàn cục ở app thật (TypeOrmModule.forRoot, ConfigModule.forRoot); ở đây dựng lại bằng một module toàn cục giả.
@Global()
@Module({
  providers: [
    { provide: DataSource, useValue: {} },
    { provide: ConfigService, useValue: createTestConfigService() },
  ],
  exports: [DataSource, ConfigService],
})
class FakeGlobalInfrastructureModule {}

describe('StaffActivationModule', () => {
  it('NSB14-24 tạo được ActivationLinkService với MailService, DataSource và ConfigService đưa vào; chỉ xuất dịch vụ', async () => {
    const fakeMail = new FakeMailService();
    const root = await Test.createTestingModule({
      imports: [FakeGlobalInfrastructureModule, StaffActivationModule],
    })
      .overrideProvider(MailService)
      .useValue(fakeMail)
      .compile();
    try {
      const service = root.get(ActivationLinkService);
      expect(service).toBeInstanceOf(ActivationLinkService);
      expect(root.get(ActivationLinkRepository)).toBeInstanceOf(
        ActivationLinkRepository,
      );
      expect(Reflect.getMetadata('exports', StaffActivationModule)).toEqual([
        ActivationLinkService,
      ]);
    } finally {
      await root.close();
    }
  });
});
