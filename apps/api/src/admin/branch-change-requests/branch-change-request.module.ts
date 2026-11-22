import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module.js';
import { NotificationModule } from '../../notification/notification.module.js';
import { RbacModule } from '../../rbac/rbac.module.js';
import { BranchModule } from '../branches/branch.module.js';
import { SystemConfigModule } from '../system-config/system-config.module.js';
import { BranchChangeApplyJob } from './apply/apply.job.js';
import { BranchChangeApplyRepository } from './apply/branch-change-apply.repository.js';
import { BranchChangeApplyService } from './apply/branch-change-apply.service.js';
import { BranchChangeRequestController } from './branch-change-request.controller.js';
import { BranchChangeRequestRepository } from './branch-change-request.repository.js';
import { BranchChangeRequestService } from './branch-change-request.service.js';

// Yêu cầu thay đổi chi nhánh (admin B9, B10, B11; B21, B22 thêm vào đây). `BranchModule` export `BranchImpactService` để tính lại ảnh hưởng (Q46)
// và `BranchRepository` để job B11 ghi lịch, dịch vụ;
// `SystemConfigModule` cho số ngày báo trước lúc duyệt (B10). Hàm đọc cho booking (Q6) nằm ở module lá riêng `PendingBranchChangesModule`.
@Module({
  imports: [
    RbacModule,
    BranchModule,
    NotificationModule,
    AuditModule,
    SystemConfigModule,
  ],
  controllers: [BranchChangeRequestController],
  providers: [
    BranchChangeRequestRepository,
    BranchChangeRequestService,
    // B11: job áp dụng khi có hiệu lực (`@Cron` được bộ lập lịch toàn ứng dụng tìm thấy, không import `ScheduleModule` ở đây)
    BranchChangeApplyRepository,
    BranchChangeApplyService,
    BranchChangeApplyJob,
  ],
})
export class BranchChangeRequestModule {}
