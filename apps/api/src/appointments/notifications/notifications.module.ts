import { Module } from '@nestjs/common';
import { MailModule } from '../../mail/mail.module.js';
import { EmailOutboxJob } from './email-outbox.job.js';
import { EmailOutboxService } from './email-outbox.service.js';

// Worker gửi thư của booking (task B15; PLAN booking 5.12; TRACKING 3.37 B15-J, phương án Z1). Module NHỎ, RIÊNG, KHÔNG import `AppointmentsModule` (không vòng) và là nơi DUY NHẤT của booking import `MailModule`.
// Vì sao không đặt trong `AppointmentsModule`: `MailModule` dựng `MailService` bằng `ConfigService`, mà bốn spec dựng riêng `AppointmentsModule` (`patient-cancel.controller.spec` HBN-01, `reception-status.controller.spec` RTS-04,
// `ports/ports.providers.spec` BPO-01, `slots/bookability.reader.int-spec`) chỉ cấp `DataSource` bằng `useMocker`; import `MailModule` ở đó làm chúng vỡ và buộc sửa file của B10 và B12.
// `DataSource` có sẵn toàn cục từ `DatabaseModule`. `AppModule` import `NotificationsModule` MỘT lần (`app.module.ts`: một dòng `import` và một phần tử mảng; Đại cho phép trực tiếp trong cửa sổ B15 ngày 14/11/2026).
// Job tắt ở NODE_ENV=test; chưa cấu hình SMTP thì thư nằm lại hàng đợi (`NOT_CONFIGURED` không tính lần thử). Không `exports`: chỉ job chạy theo lịch.
@Module({
  imports: [MailModule],
  providers: [EmailOutboxService, EmailOutboxJob],
})
export class NotificationsModule {}
