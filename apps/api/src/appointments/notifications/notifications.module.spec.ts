import { MODULE_METADATA } from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { MailModule } from '../../mail/mail.module.js';
import { MailService } from '../../mail/mail.service.js';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { AppointmentsModule } from '../appointments.module.js';
import { EmailOutboxJob } from './email-outbox.job.js';
import { EmailOutboxService } from './email-outbox.service.js';
import { NotificationsModule } from './notifications.module.js';

// Task B15 — vỏ của `NotificationsModule` (PLAN booking 5.12; TRACKING 3.37 B15-J, phương án Z1): nối dây DI thật với `MailService` GIẢ (không cấu hình SMTP, không gửi thư; TB-08), và hướng phụ thuộc: module này nhập `MailModule`,
// KHÔNG nhập `AppointmentsModule` (không vòng), nên `AppointmentsModule` không cần `ConfigService`. Đơn vị, không DB.
const noDatabase = (token: unknown) =>
  token === DataSource ? ({} as DataSource) : undefined;

describe('OBX-09 NotificationsModule: nối dây DI với MailService giả', () => {
  it('dựng được với `overrideProvider(MailService)`: job và dịch vụ gửi thư có mặt, mail thật không được dựng', async () => {
    const fake = new FakeMailService();
    const moduleRef = await Test.createTestingModule({
      imports: [NotificationsModule],
    })
      .overrideProvider(MailService)
      .useValue(fake)
      .useMocker(noDatabase)
      .compile();
    try {
      expect(moduleRef.get(EmailOutboxJob)).toBeInstanceOf(EmailOutboxJob);
      expect(moduleRef.get(EmailOutboxService)).toBeInstanceOf(
        EmailOutboxService,
      );
      expect(moduleRef.get(MailService, { strict: false })).toBe(fake);
      expect(fake.attempts).toEqual([]);
    } finally {
      await moduleRef.close();
    }
  });

  it('chỉ nhập MailModule; không import AppointmentsModule (không vòng) và không exports gì', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      NotificationsModule,
    ) as unknown[];
    expect(imports).toEqual([MailModule]);
    expect(imports).not.toContain(AppointmentsModule);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, NotificationsModule),
    ).toBeUndefined();
  });

  it('AppointmentsModule KHÔNG import MailModule: bốn spec dựng riêng nó vẫn dựng được mà không cần ConfigService', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AppointmentsModule,
    ) as unknown[];
    expect(imports).not.toContain(MailModule);
    expect(imports).not.toContain(NotificationsModule);
  });
});
