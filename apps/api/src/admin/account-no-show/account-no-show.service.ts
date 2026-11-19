import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { accountVisibility } from '../accounts/account-visibility.js';
import { AccountNoShowRepository } from './account-no-show.repository.js';
import {
  accountNotPatient,
  accountStateNotAllowed,
} from './account-no-show.errors.js';

/** Phản hồi 200: giá trị MỚI của cờ và số lần no-show hiện tại (KHÔNG đổi) để giao diện báo "no-show kế tiếp có thể khoá lại ngay". */
export interface UnlockNoShowResult {
  taiKhoanId: string;
  khoaDatLichDoNoShow: false;
  soLanNoShow: number;
}

@Injectable()
export class AccountNoShowService {
  constructor(
    @Inject(AccountNoShowRepository)
    private readonly repository: AccountNoShowRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // Một giao dịch; thứ tự kiểm theo PLAN admin 5.6 (4a/4b) và TRACKING 9A.10 mục 2.3.
  unlock(
    scope: AdminScope,
    actorId: string,
    id: string,
  ): Promise<UnlockNoShowResult> {
    return this.repository.transaction((manager) =>
      this.apply(manager, scope, actorId, id),
    );
  }

  private async apply(
    manager: EntityManager,
    scope: AdminScope,
    actorId: string,
    id: string,
  ): Promise<UnlockNoShowResult> {
    // 1. Tồn tại VÀ trong tầm nhìn: một câu truy vấn nên "không có" và "ngoài tầm nhìn" cùng 404 (Q40).
    const kind = await this.repository.findVisibleKind(
      manager,
      accountVisibility(this.policy, scope),
      id,
    );
    if (kind === null) throw new AppException(404, 'KHONG_TIM_THAY');
    // 2. Thấy được nhưng không có quyền (Admin Chi nhánh): 403, SAU bước tầm nhìn nên không lộ ai "ngoài tầm nhìn".
    this.policy.assertToanHeThong(scope);
    // 3. Hành động hợp lệ với loại đích: chỉ Bệnh nhân có cờ no-show.
    if (kind !== 'BenhNhan') throw accountNotPatient();

    // 4. Khoá hàng `benh_nhan` rồi kiểm LẠI dưới khoá. Không có dòng (chưa xác minh) hoặc cờ đang tắt: không có gì để mở khoá.
    const counter = await this.repository.lockCounter(manager, id);
    if (counter === null || !counter.khoa) throw accountStateNotAllowed();

    // 5. Tắt đúng một cột. Đã giữ khoá và vừa thấy cờ bật nên phải đúng 1 hàng; khác đi là lỗi hệ thống (rollback, 500).
    if (!(await this.repository.clearFlag(manager, id)))
      throw new Error(`không tắt được cờ no-show của tài khoản ${id}`);

    // 6. Audit CÙNG giao dịch, SAU CÙNG (bảng chỉ-thêm). Lỗi ghi làm hỏng cả giao dịch: cờ không đổi (TK-25). Không bắt lỗi.
    await this.audit.record(manager, {
      actorId,
      branchId: null,
      action: 'MoKhoaNoShow',
      targetType: 'benh_nhan',
      targetId: id,
      result: 'ThanhCong',
      changes: {
        truoc: { khoa_dat_lich_do_no_show: true },
        sau: { khoa_dat_lich_do_no_show: false },
        so_lan_no_show: counter.soLan,
      },
    });

    return {
      taiKhoanId: id,
      khoaDatLichDoNoShow: false,
      soLanNoShow: counter.soLan,
    };
  }
}
