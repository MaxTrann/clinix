import type { NestExpressApplication } from '@nestjs/platform-express';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { MailService } from './../src/mail/mail.service.js';
import { FakeMailService } from './../src/mail/testing/fake-mail.service.js';
import { NotificationCenterModule } from './../src/notification/center/notification-center.module.js';
import { AppointmentReminderJob } from './../src/notification/reminders/appointment-reminder.job.js';
import {
  REMINDER_CRON,
  REMINDER_JOB_NAME,
} from './../src/notification/reminders/reminder.constants.js';
import { ReminderModule } from './../src/notification/reminders/reminder.module.js';
import { readReminders } from './../src/notification/testing/reminder-fixtures.js';

// notification B3 — HTB-05: AppModule THẬT (MySQL thật, MailService giả) dựng được cùng `NotificationCenterModule` và `ReminderModule`; job nhắc lịch đăng ký ĐÚNG một tên, đang TẮT vì NODE_ENV=test,
// và chạy đúng qua hàm bọc của bộ lập lịch (`fireOnTick`, không đối số `Date` ⇒ lấy đồng hồ). "Đúng MỘT ScheduleModule trong cây import" đã có ở auth-cleanup-job.e2e-spec.ts (E2E-J02).
const mail = new FakeMailService();
let app: NestExpressApplication;
let db: DataSource;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  db = app.get(DataSource);
});

beforeEach(async () => {
  await resetTables(db);
  mail.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await app.close();
});

describe('HTB-05 ReminderModule trong AppModule', () => {
  it('AppModule nhập cả NotificationCenterModule và ReminderModule; job là provider lấy được từ ứng dụng thật', () => {
    const imports = Reflect.getMetadata('imports', AppModule) as unknown[];
    expect(imports).toContain(NotificationCenterModule);
    expect(imports.filter((m) => m === ReminderModule)).toHaveLength(1);
    expect(app.get(AppointmentReminderJob, { strict: false })).toBeInstanceOf(
      AppointmentReminderJob,
    );
  });

  it('job nằm trong registry ĐÚNG một lần với đúng biểu thức và đang TẮT vì NODE_ENV=test', () => {
    const registry = app.get(SchedulerRegistry);
    expect(
      [...registry.getCronJobs().keys()].filter(
        (name) => name === REMINDER_JOB_NAME,
      ),
    ).toEqual([REMINDER_JOB_NAME]);
    const cron = registry.getCronJob(REMINDER_JOB_NAME);
    expect(cron.cronTime.source).toBe(REMINDER_CRON);
    expect(cron.isActive).toBe(false);
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('bộ lập lịch gọi job (không đối số Date ⇒ đồng hồ): lịch có mốc 2 giờ đến hạn được nhắc MỘT lần', async () => {
    const fx = new BookingFixtures(db);
    const w = await fx.world();
    const lich = await fx.appointmentIn('DaXacNhan', {
      doctor: w.doctor.profile,
      khungGioId: w.slotIds[0] ?? '',
      patientId: w.patient.account.taiKhoanId,
    });
    // Giờ hẹn = đồng hồ giả + 2 giờ (mốc 2 giờ đến hạn đúng lúc này)
    await db.query('UPDATE lich_hen SET thoi_gian = ? WHERE lich_hen_id = ?', [
      new Date(T0.getTime() + 2 * 3_600_000),
      lich.lichHenId,
    ]);
    void app.get(SchedulerRegistry).getCronJob(REMINDER_JOB_NAME).fireOnTick();
    await vi.waitFor(async () => {
      expect(await readReminders(db, lich.lichHenId)).toMatchObject([
        { soGioTruoc: 2, trangThai: 'DaGui', soLanThu: 1 },
      ]);
    });
    expect(mail.sent).toHaveLength(1);
  });
});
