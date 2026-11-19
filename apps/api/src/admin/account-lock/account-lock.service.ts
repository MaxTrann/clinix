import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service.js';
import { SessionService } from '../../auth/session/session.service.js';
import { todayVN } from '../../common/time/time.js';
import { isDeadlockError } from '../../database/mysql-errors.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { accountVisibility } from '../accounts/account-visibility.js';
import { notFoundError } from './account-lock.errors.js';
import { decideLockAction, isSystemAdmin } from './account-lock.policy.js';
import { AccountLockRepository } from './account-lock.repository.js';
import type {
  LockAction,
  LockResponse,
  LockTarget,
  UnlockResponse,
} from './account-lock.types.js';

// Số lần chạy tối đa của một giao dịch khoá / mở khoá khi gặp deadlock (1213) hoặc đích đổi loại giữa hai bước. Thân giao dịch
// không giữ trạng thái và mọi ghi (trạng thái, thu hồi phiên, audit) nằm TRONG giao dịch nên lần bị hoàn tác không để lại gì.
const MAX_ATTEMPTS = 3;

// Đích đổi từ "không phải" sang "là" Quản trị viên Toàn hệ thống (hay ngược lại) giữa lần đọc thường và lần khoá: tập khoá đã chọn
// sai. Hiện không có đường mã nào đổi `pham_vi_quan_tri`; giữ để phòng thủ và để làm lại giao dịch.
class LockPlanChangedError extends Error {
  constructor() {
    super('Tập khoá không còn khớp loại tài khoản đích');
  }
}

type Apply<T> = (
  manager: EntityManager,
  target: LockTarget,
  today: string,
) => Promise<T>;

@Injectable()
export class AccountLockService {
  constructor(
    @Inject(AccountLockRepository)
    private readonly repository: AccountLockRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  lock(scope: AdminScope, actorId: string, id: string): Promise<LockResponse> {
    return this.execute('lock', scope, actorId, id, (manager, target, today) =>
      this.applyLock(manager, actorId, target, today),
    );
  }

  unlock(
    scope: AdminScope,
    actorId: string,
    id: string,
  ): Promise<UnlockResponse> {
    return this.execute('unlock', scope, actorId, id, (manager, target) =>
      this.applyUnlock(manager, actorId, target),
    );
  }

  private async execute<T>(
    action: LockAction,
    scope: AdminScope,
    actorId: string,
    id: string,
    apply: Apply<T>,
  ): Promise<T> {
    const visibility = accountVisibility(this.policy, scope);
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.attemptOnce(
          action,
          scope,
          actorId,
          id,
          visibility,
          apply,
        );
      } catch (error) {
        const retryable =
          error instanceof LockPlanChangedError || isDeadlockError(error);
        if (!retryable || attempt >= MAX_ATTEMPTS) throw error;
      }
    }
  }

  private async attemptOnce<T>(
    action: LockAction,
    scope: AdminScope,
    actorId: string,
    id: string,
    visibility: ReturnType<typeof accountVisibility>,
    apply: Apply<T>,
  ): Promise<T> {
    // (1) tồn tại và (2) tầm nhìn: MỘT truy vấn, MỘT đường mã, cùng 404.
    const preRead = await this.repository.preRead(visibility, id);
    if (preRead === null) throw notFoundError();

    // Đích là Toàn hệ thống: khoá cả tập theo id tăng dần ngay từ đầu (đích nằm trong tập), kẻo hai Toàn hệ thống khoá nhau
    // sẽ giữ một hàng và chờ hàng kia (deadlock) hoặc cùng đếm "còn một" rồi cùng khoá (về 0).
    const setIds = isSystemAdmin(preRead)
      ? await this.repository.listSystemAdminIds()
      : null;
    const today = todayVN();

    return this.repository.transaction(async (manager) => {
      // Câu ĐẦU TIÊN của giao dịch là câu khoá: `SessionService.revokeAll` yêu cầu `tai_khoan` đã khoá trước lần đọc thường đầu tiên.
      const systemAdmins =
        setIds === null
          ? []
          : await this.repository.lockAccounts(manager, [
              ...new Set([...setIds, preRead.taiKhoanId]),
            ]);
      const target = await this.repository.readTarget(
        manager,
        visibility,
        id,
        setIds === null,
      );
      if (target === null) throw notFoundError();
      if (isSystemAdmin(target) !== (setIds !== null))
        throw new LockPlanChangedError();

      decideLockAction({ action, scope, actorId, target, systemAdmins });
      return apply(manager, target, today);
    });
  }

  // Khoá: trạng thái → thu hồi MỌI phiên (cùng giao dịch, Q29) → audit → (Bác sĩ) việc phụ thuộc. Lỗi ở bất kỳ bước nào làm hỏng
  // cả giao dịch (trạng thái giữ nguyên); không bắt lỗi (TK-24, TK-25). B18 không tự xử lý lịch hẹn và ca của Bác sĩ (Q28).
  private async applyLock(
    manager: EntityManager,
    actorId: string,
    target: LockTarget,
    today: string,
  ): Promise<LockResponse> {
    if (!(await this.repository.setLocked(manager, target.taiKhoanId)))
      throw new Error('Không ghi được trạng thái khoá dù đã khoá hàng');
    const revoked = await this.sessions.revokeAll(target.taiKhoanId, {
      manager,
    });
    await this.audit.record(manager, {
      actorId,
      branchId: auditBranchOf(target),
      action: 'KhoaTaiKhoan',
      targetType: 'tai_khoan',
      targetId: target.taiKhoanId,
      result: 'ThanhCong',
      changes: {
        truoc: { trang_thai: 'DangHoatDong' },
        sau: { trang_thai: 'NgungHoatDong' },
        phien_thu_hoi: revoked,
      },
    });
    const response: LockResponse = {
      taiKhoanId: target.taiKhoanId,
      loaiTaiKhoan: target.loaiTaiKhoan,
      trangThai: 'NgungHoatDong',
      soPhienThuHoi: revoked,
    };
    if (target.loaiTaiKhoan === 'BacSi')
      response.phuThuoc = await this.repository.readDependents(
        manager,
        target.taiKhoanId,
        today,
      );
    return response;
  }

  // Mở khoá: về `DangHoatDong`, xoá bộ đếm sai và khoá tạm (Q28). Không thu hồi phiên (khi khoá đã thu hồi hết) nên `phien_thu_hoi` là 0.
  // Không đổi `so_lan_no_show` hay cờ khoá no-show (việc của B19).
  private async applyUnlock(
    manager: EntityManager,
    actorId: string,
    target: LockTarget,
  ): Promise<UnlockResponse> {
    if (!(await this.repository.setUnlocked(manager, target.taiKhoanId)))
      throw new Error('Không ghi được trạng thái mở khoá dù đã khoá hàng');
    await this.audit.record(manager, {
      actorId,
      branchId: auditBranchOf(target),
      action: 'MoKhoaTaiKhoan',
      targetType: 'tai_khoan',
      targetId: target.taiKhoanId,
      result: 'ThanhCong',
      changes: {
        truoc: { trang_thai: 'NgungHoatDong' },
        sau: { trang_thai: 'DangHoatDong' },
        phien_thu_hoi: 0,
      },
    });
    return {
      taiKhoanId: target.taiKhoanId,
      loaiTaiKhoan: target.loaiTaiKhoan,
      trangThai: 'DangHoatDong',
    };
  }
}

// PLAN 5.10: chi nhánh của đích với nhân sự (Bác sĩ, Lễ tân); null với Bệnh nhân và Quản trị viên.
function auditBranchOf(target: LockTarget): string | null {
  return target.loaiTaiKhoan === 'BacSi' || target.loaiTaiKhoan === 'LeTan'
    ? target.chiNhanhId
    : null;
}
