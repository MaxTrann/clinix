import { MODULE_METADATA } from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { SystemConfigModule } from '../../admin/system-config/system-config.module.js';
import { AppointmentsModule } from '../../appointments/appointments.module.js';
import { MailModule } from '../../mail/mail.module.js';
import { MailService } from '../../mail/mail.service.js';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { AppointmentReminderJob } from './appointment-reminder.job.js';
import { AppointmentReminderService } from './appointment-reminder.service.js';
import { ReminderModule } from './reminder.module.js';

// notification B3 — vỏ `ReminderModule` (HTB-05 phần module; nếp OBX-09 của `NotificationsModule`): nối dây DI với `MailService` GIẢ (không SMTP, không thư thật), hướng phụ thuộc.
// Đơn vị, không DB. Phần AppModule thật (đăng ký đúng một tên, tắt ở NODE_ENV=test, MỘT ScheduleModule) ở test/notification-reminder.e2e-spec.ts.
const noDatabase = (token: unknown) =>
  token === DataSource ? ({} as DataSource) : undefined;

describe('HTB-05 ReminderModule', () => {
  it('dựng được với MailService giả: job và service có mặt, không thư nào được gửi', async () => {
    const fake = new FakeMailService();
    const moduleRef = await Test.createTestingModule({
      imports: [ReminderModule],
    })
      .overrideProvider(MailService)
      .useValue(fake)
      .useMocker(noDatabase)
      .compile();
    try {
      expect(moduleRef.get(AppointmentReminderJob)).toBeInstanceOf(
        AppointmentReminderJob,
      );
      expect(moduleRef.get(AppointmentReminderService)).toBeInstanceOf(
        AppointmentReminderService,
      );
      expect(fake.attempts).toEqual([]);
    } finally {
      await moduleRef.close();
    }
  });

  it('chỉ nhập MailModule và SystemConfigModule; không AppointmentsModule, không exports', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ReminderModule,
    ) as unknown[];
    expect(imports).toEqual([MailModule, SystemConfigModule]);
    expect(imports).not.toContain(AppointmentsModule);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, ReminderModule),
    ).toBeUndefined();
  });
});
