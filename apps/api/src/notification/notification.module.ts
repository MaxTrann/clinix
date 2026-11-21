import { Module } from '@nestjs/common';
import { BranchChangeNotifier } from './branch-change-notifier.js';

// Module `notification` tối thiểu (admin C4; PLAN admin 5.1, Q9). Không có worker riêng: thư đi qua hộp thư đi và worker của booking (B15).
// Không import `MailModule` hay `AppointmentsModule`: notifier chỉ ghi DB bằng `em` của người gọi. Các task B9, B10, B11, B21, B22 import module này.
@Module({
  providers: [BranchChangeNotifier],
  exports: [BranchChangeNotifier],
})
export class NotificationModule {}
