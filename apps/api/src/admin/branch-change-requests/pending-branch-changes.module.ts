import { Module } from '@nestjs/common';
import { PendingBranchChangesReader } from './pending-branch-changes.reader.js';

// Module LÁ (admin B10; Q6): chỉ có hàm đọc cho booking, không import module nào. Booking B16b import module này để dựng adapter
// `PendingBranchChangesPort` mà không tạo vòng import với `AppointmentsModule` (cảnh báo ở `appointments.module.ts`). Export CẢ LỚP để dùng `useExisting`/tiêm thẳng.
@Module({
  providers: [PendingBranchChangesReader],
  exports: [PendingBranchChangesReader],
})
export class PendingBranchChangesModule {}
