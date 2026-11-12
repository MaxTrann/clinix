import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { APPROVAL_ERROR_CODES } from './admin-leave.constants.js';
import { AdminLeaveRepository } from './admin-leave.repository.js';
import {
  type CancellationSummary,
  LeaveCancellationRunner,
} from './leave-cancellation.runner.js';
import { leaveNotFound } from './leave-facts.js';

export interface RetriedLeaveRequest {
  yeuCauNghiPhepId: string;
  trangThai: 'DaDuyet';
  huyLichHen: CancellationSummary;
}

/**
 * Nút "Xử lý lại" của Quản trị viên (B16; PLAN doctor 5.8): chạy lại bước huỷ lịch hẹn của MỘT yêu cầu đã duyệt, bằng đúng `LeaveCancellationRunner` mà Duyệt và sweeper dùng.
 * Không mở giao dịch và không khoá gì của module này (chỉ đọc yêu cầu để kiểm phạm vi và trạng thái); idempotent vì `cancel` của booking trả `AlreadyCancelled` cho lịch đã huỷ.
 * Không ghi nhật ký hay thông báo: việc duyệt đã được ghi ở B15; lần này chỉ hoàn tất phần huỷ còn dang dở.
 */
@Injectable()
export class AdminLeaveRetryService {
  constructor(
    @Inject(AdminLeaveRepository)
    private readonly repository: AdminLeaveRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
    @Inject(LeaveCancellationRunner)
    private readonly runner: LeaveCancellationRunner,
  ) {}

  async retry(scope: AdminScope, id: string): Promise<RetriedLeaveRequest> {
    const row = await this.repository.findOne(this.repository.manager(), id);
    if (row === null) throw leaveNotFound();
    // Phạm vi theo chi nhánh HIỆN TẠI của bác sĩ; ngoài phạm vi ⇒ 404 TRƯỚC khi nói gì về trạng thái (không lộ).
    this.policy.assertCanSee(scope, row.chiNhanhId);
    // Chỉ yêu cầu đã duyệt mới có gì để huỷ. Dùng lại mã `YEU_CAU_DA_XU_LY` (Trung chốt 12/11/2026) nhưng nói rõ điều kiện trong thông báo.
    if (row.trangThai !== 'DaDuyet') {
      throw new AppException(409, APPROVAL_ERROR_CODES.ALREADY_HANDLED, {
        thongBao: 'Chỉ xử lý lại được yêu cầu đã duyệt.',
      });
    }
    const huyLichHen = await this.runner.run(
      {
        bacSiId: row.bacSiId,
        tuNgay: row.tuNgay,
        denNgay: row.denNgay,
        ca: row.ca,
      },
      toSecond(nowVN()),
    );
    return { yeuCauNghiPhepId: id, trangThai: 'DaDuyet', huyLichHen };
  }
}
