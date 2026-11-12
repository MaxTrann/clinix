import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { shouldRetry } from '../common/mysql-errors.js';
import {
  LEAVE_EVENTS,
  LeaveNotifier,
} from '../notifications/leave-notifier.js';
import { APPROVAL_ERROR_CODES } from './admin-leave.constants.js';
import { AdminLeaveRepository } from './admin-leave.repository.js';
import { normalizeRejectReason } from './admin-leave-reject.rules.js';
import {
  leaveAlreadyHandled,
  leaveAuditFacts,
  leaveNotFound,
  leaveNotification,
} from './leave-facts.js';

export interface RejectedLeaveRequest {
  yeuCauNghiPhepId: string;
  trangThai: 'TuChoi';
  /** ISO 8601 UTC */
  thoiDiemXuLy: string;
}

/**
 * Quản trị viên TỪ CHỐI một yêu cầu nghỉ (B14; PLAN doctor 5.8, 5.9; Q27c, Q31, Q34). Chỉ khoá hàng yêu cầu: từ chối không đổi gì mà `booking` quan tâm.
 * Khung giờ "nhận lịch trở lại" là hệ quả suy ra (yêu cầu không còn `ChoDuyet`/`DaDuyet`), không có gì để ghi lại ở đó.
 */
@Injectable()
export class AdminLeaveRejectService {
  constructor(
    @Inject(AdminLeaveRepository)
    private readonly repository: AdminLeaveRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LeaveNotifier) private readonly notifier: LeaveNotifier,
  ) {}

  async reject(
    scope: AdminScope,
    actorId: string,
    id: string,
    rawReason: unknown,
  ): Promise<RejectedLeaveRequest> {
    // Kiểm lý do trước mọi thao tác DB (400). Lý do là chữ của Admin, không phải lý do xin nghỉ của Bác sĩ.
    const reason = normalizeRejectReason(rawReason);
    if (reason === null) {
      throw new AppException(400, APPROVAL_ERROR_CODES.REJECT_REASON_INVALID, {
        thongBao: 'Vui lòng nhập lý do từ chối (tối đa 255 ký tự).',
      });
    }
    // `now` chốt một lần, kể cả khi giao dịch phải chạy lại (H18).
    const processedAt = toSecond(nowVN());
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.repository.transaction((em) =>
          this.rejectInTransaction(em, scope, actorId, id, reason, processedAt),
        );
      } catch (error) {
        // Deadlock/hết chờ khoá xảy ra trước commit nên chạy lại cả giao dịch là an toàn (Q40).
        if (shouldRetry(error, attempt)) continue;
        throw error;
      }
    }
  }

  private async rejectInTransaction(
    em: EntityManager,
    scope: AdminScope,
    actorId: string,
    id: string,
    reason: string,
    processedAt: Date,
  ): Promise<RejectedLeaveRequest> {
    // 1. Khoá hàng yêu cầu: hai Admin cùng xử lý thì người sau chờ rồi thấy trạng thái mới (Q31, DH-08).
    if ((await this.repository.lockRequest(em, id)) === null)
      throw leaveNotFound();
    // 2. Phạm vi theo chi nhánh HIỆN TẠI của bác sĩ, đọc sau khoá. Ngoài phạm vi ⇒ 404 TRƯỚC khi nói gì về trạng thái (không lộ).
    const row = await this.repository.findOne(em, id);
    if (row === null) throw leaveNotFound();
    this.policy.assertCanSee(scope, row.chiNhanhId);
    // 3. Kiểm lại dưới khoá.
    if (row.trangThai !== 'ChoDuyet') throw leaveAlreadyHandled();
    // 4. Đổi trạng thái. 0 hàng là không thể xảy ra dưới khoá; nếu xảy ra thì báo như đã xử lý, không ghi nhật ký sai.
    const changed = await this.repository.markRejected(
      em,
      id,
      actorId,
      processedAt,
    );
    if (changed !== 1) throw leaveAlreadyHandled();
    // 5. Nhật ký và thông báo CÙNG giao dịch: lỗi ghi (PD-18) hoàn tác cả việc từ chối.
    await this.audit.record(em, {
      actorId,
      branchId: row.chiNhanhId, // chi nhánh hiện tại của bác sĩ (PLAN 5.12)
      action: 'TuChoiNghiPhep',
      targetType: 'yeu_cau_nghi_phep',
      targetId: id,
      result: 'ThanhCong',
      changes: {
        ...leaveAuditFacts(row),
        // Lý do của ADMIN (1–255), không bao giờ là lý do xin nghỉ của Bác sĩ (Q34).
        ly_do_tu_choi: reason,
      },
    });
    await this.notifier.notify(em, {
      ...leaveNotification(row),
      loaiSuKien: LEAVE_EVENTS.Rejected,
      lyDoTuChoi: reason,
    });
    return {
      yeuCauNghiPhepId: id,
      trangThai: 'TuChoi',
      thoiDiemXuLy: processedAt.toISOString(),
    };
  }
}
