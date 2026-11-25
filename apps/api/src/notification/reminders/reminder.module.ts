import { Module } from '@nestjs/common';
import { SystemConfigModule } from '../../admin/system-config/system-config.module.js';
import { MailModule } from '../../mail/mail.module.js';
import { AppointmentReminderJob } from './appointment-reminder.job.js';
import { AppointmentReminderService } from './appointment-reminder.service.js';

// Nhắc lịch hẹn (notification B3; 2.4.69). Nhập `MailModule` (gửi thư thẳng, không qua hộp thư đi `email_thong_bao`) và `SystemConfigModule` (mốc nhắc).
// KHÔNG nhập `AppointmentsModule`: chỉ dùng các hàm đọc thuần của `appointments/notifications/` (dữ kiện thư, chân thư, mẫu thư) và hằng cỡ lô. Không export.
// `ScheduleModule.forRoot()` chỉ có ở `app.module.ts` (HTB-05).
@Module({
  imports: [MailModule, SystemConfigModule],
  providers: [AppointmentReminderService, AppointmentReminderJob],
})
export class ReminderModule {}
