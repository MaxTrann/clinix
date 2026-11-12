import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { nowVN, todayVN, toSecond } from '../../common/time/time.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { shouldRetry } from '../common/mysql-errors.js';
import {
  LEAVE_EVENTS,
  LeaveNotifier,
} from '../notifications/leave-notifier.js';
import { APPROVAL_ERROR_CODES } from './admin-leave.constants.js';
import {
  AdminLeaveRepository,
  type AdminLeaveRow,
} from './admin-leave.repository.js';
import {
  type CancellationSummary,
  LeaveCancellationRunner,
} from './leave-cancellation.runner.js';
import {
  leaveAlreadyHandled,
  leaveAuditFacts,
  leaveNotFound,
  leaveNotification,
} from './leave-facts.js';

export interface ApprovedLeaveRequest {
  yeuCauNghiPhepId: string;
  trangThai: 'DaDuyet';
  /** ISO 8601 UTC */
  thoiDiemXuLy: string;
  huyLichHen: CancellationSummary;
}

/**
 * Quản trị viên DUYỆT một yêu cầu nghỉ (B15; PLAN doctor 5.8, 5.9; Q26, Q29, Q30, Q31, Q34). Hai giai đoạn (booking D5):
 *  1. Một giao dịch `READ COMMITTED`: `bac_si` FOR UPDATE → hàng yêu cầu FOR UPDATE → kiểm lại → `DaDuyet` + nhật ký + thông báo → commit.
 *  2. SAU commit (đã nhả khoá `bac_si`): `LeaveCancellationRunner` huỷ từng lịch bị ảnh hưởng qua `booking`, mỗi lịch một giao dịch riêng.
 * Lỗi ở bước 2 KHÔNG làm hỏng việc duyệt: trả 200 với `huyLichHen.hoanTat = false`.
 */
@Injectable()
export class AdminLeaveApproveService {
  constructor(
    @Inject(AdminLeaveRepository)
    private readonly repository: AdminLeaveRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LeaveNotifier) private readonly notifier: LeaveNotifier,
    @Inject(LeaveCancellationRunner)
    private readonly runner: LeaveCancellationRunner,
  ) {}

  async approve(
    scope: AdminScope,
    actorId: string,
    id: string,
  ): Promise<ApprovedLeaveRequest> {
    // Đọc thường để biết bác sĩ nào cần khoá (khoá `bac_si` phải đi TRƯỚC khoá hàng yêu cầu, PLAN 5.9). `bac_si_id` của yêu cầu không bao giờ đổi.
    const before = await this.repository.findOne(this.repository.manager(), id);
    if (before === null) throw leaveNotFound();

    // `now` chốt một lần cho cả hai bước và mọi lần chạy lại (H18).
    const now = toSecond(nowVN());
    const row = await this.withRetry(() =>
      this.repository.transaction((em) =>
        this.approveInTransaction(em, scope, actorId, id, before.bacSiId, now),
      ),
    );

    // Bước 2: ngoài giao dịch. `now` là cận dưới: lịch đã qua giờ trong khoảng nghỉ không bị huỷ (Q30, H19).
    const huyLichHen = await this.runner.run(
      {
        bacSiId: row.bacSiId,
        tuNgay: row.tuNgay,
        denNgay: row.denNgay,
        ca: row.ca,
      },
      now,
    );
    return {
      yeuCauNghiPhepId: id,
      trangThai: 'DaDuyet',
      thoiDiemXuLy: now.toISOString(),
      huyLichHen,
    };
  }

  /** Deadlock/hết chờ khoá xảy ra TRƯỚC commit nên chạy lại cả giao dịch là an toàn (Q40); không bao giờ chạy lại sau commit. */
  private async withRetry<T>(work: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await work();
      } catch (error) {
        if (shouldRetry(error, attempt)) continue;
        throw error;
      }
    }
  }

  private async approveInTransaction(
    em: EntityManager,
    scope: AdminScope,
    actorId: string,
    id: string,
    bacSiId: string,
    now: Date,
  ): Promise<AdminLeaveRow> {
    // 1. Khoá `bac_si` (tầng 4): đặt lịch cho bác sĩ này (FOR SHARE) phải chờ tới khi `DaDuyet` commit (H6).
    if (!(await this.repository.lockDoctor(em, bacSiId))) throw leaveNotFound();
    // 2. Khoá hàng yêu cầu: hai Admin cùng xử lý thì người sau chờ rồi thấy trạng thái mới (Q31, DH-08).
    if ((await this.repository.lockRequest(em, id)) === null)
      throw leaveNotFound();
    // 3. Phạm vi theo chi nhánh HIỆN TẠI của bác sĩ, đọc sau khoá. Ngoài phạm vi ⇒ 404 TRƯỚC khi nói gì về trạng thái (không lộ).
    const row = await this.repository.findOne(em, id);
    if (row === null) throw leaveNotFound();
    this.policy.assertCanSee(scope, row.chiNhanhId);
    // 4. Kiểm lại dưới khoá: còn chờ duyệt (Q31), và chưa trôi qua hết (Q30: ngày kết thúc trước hôm nay thì chỉ còn Từ chối).
    if (row.trangThai !== 'ChoDuyet') throw leaveAlreadyHandled();
    if (row.denNgay < todayVN(now)) {
      throw new AppException(409, APPROVAL_ERROR_CODES.EXPIRED, {
        thongBao: 'Yêu cầu đã quá hạn, chỉ có thể từ chối.',
      });
    }
    // 5. Đổi trạng thái. 0 hàng là không thể xảy ra dưới khoá; nếu xảy ra thì báo như đã xử lý, không ghi nhật ký sai.
    if ((await this.repository.markApproved(em, id, actorId, now)) !== 1)
      throw leaveAlreadyHandled();
    // 6. Nhật ký và thông báo CÙNG giao dịch: lỗi ghi hoàn tác cả việc duyệt (H12). Nhật ký không chép danh sách lịch hẹn (PLAN 5.12).
    await this.audit.record(em, {
      actorId,
      branchId: row.chiNhanhId, // chi nhánh hiện tại của bác sĩ (PLAN 5.12)
      action: 'DuyetNghiPhep',
      targetType: 'yeu_cau_nghi_phep',
      targetId: id,
      result: 'ThanhCong',
      changes: leaveAuditFacts(row),
    });
    await this.notifier.notify(em, {
      ...leaveNotification(row),
      loaiSuKien: LEAVE_EVENTS.Approved,
    });
    return row;
  }
}
