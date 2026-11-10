import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import type {
  AdminDoctorListDto,
  AdminScheduleGridDto,
} from './admin-schedule.dto.js';
import { ScheduleGridService } from './schedule-grid.service.js';

/** Quản trị viên xem lịch bác sĩ (PLAN doctor 5.6). Toàn hệ thống: mọi chi nhánh; Chi nhánh: chỉ bác sĩ và ca thuộc chi nhánh mình. */
@Injectable()
export class AdminScheduleService {
  constructor(
    @Inject(ScheduleGridService) private readonly grid: ScheduleGridService,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
  ) {}

  /** Danh sách bác sĩ để chọn. Admin Chi nhánh bị ÉP chi nhánh của mình, `chiNhanhId` gửi lên bị bỏ qua. */
  listDoctors(scope: AdminScope, query: AdminDoctorListDto) {
    return this.grid.listDoctors(
      this.policy.branchFilter(scope, query.chiNhanhId),
      query,
    );
  }

  getGrid(scope: AdminScope, query: AdminScheduleGridDto) {
    return this.grid.getGrid(
      {
        scopeBranchId: this.policy.branchFilter(scope),
        filterBranchId: this.policy.branchFilter(scope, query.chiNhanhId),
        // Admin: bác sĩ ngoài phạm vi và không tồn tại cùng 404 (admin Q40).
        outOfScope: () => new AppException(404, COMMON_ERROR_CODES.NOT_FOUND),
      },
      query,
    );
  }
}
