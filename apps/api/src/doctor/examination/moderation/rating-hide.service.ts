import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { withBookingTransaction } from '../../../appointments/locking/booking-transaction.js';
import { AuditService } from '../../../audit/audit.service.js';
import { AppException } from '../../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../../common/errors/error-codes.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { fieldErrorsException } from '../exam-record/exam-record.failure.js';
import type { HiddenRatingView, HideRatingDto } from './rating-hide.dto.js';
import { hideResult, type HideOutcome } from './rating-hide.failure.js';
import {
  RatingHideRepository,
  type HideTarget,
} from './rating-hide.repository.js';
import { validateHideReason } from './rating-hide.rules.js';

// Quản trị viên ẨN một đánh giá bác sĩ (doctor-exam B8; PLAN 5.3, 5.8, 5.12; Q8; KDD-04…KDD-10, TDK-05). MỘT chiều: không có đường hiện lại. Không thông báo, không `UPDATE lich_hen`, không khoá `lich_hen`.
//
// Luồng (đúng thứ tự khoá của PLAN 5.3, chỉ xin tầng 6b):
//  1. `validateHideReason` (chuẩn hoá, `LY_DO_*`, dạng bí mật): lỗi ⇒ 400 `DU_LIEU_KHONG_HOP_LE` kèm `loi[]`, CHƯA chạm DB.
//  2. Đọc THƯỜNG đánh giá kèm chi nhánh và bác sĩ của lịch, NGOÀI giao dịch. Không có ⇒ 404. Rồi `assertCanSee(scope, chiNhanhId)` ⇒ 404 CÙNG thân. Phạm vi kiểm TRƯỚC mọi khoá và mọi ghi: Admin Chi nhánh
//     ẩn đánh giá chi nhánh khác nhận 404 mà không ghi gì và không chờ khoá. Đọc thường đủ vì chi nhánh và bác sĩ của lịch bất biến sau khi đặt (xem `rating-hide.repository.ts`).
//  3. `withBookingTransaction` (READ COMMITTED, trần chờ khoá 3 giây, thử lại ≤ 2 cho 1213 và 1205 ⇒ 503): `lock` (`FOR UPDATE` theo khoá chính) ⇒ đã ẩn ⇒ `AlreadyHidden` (không ghi) ⇒ `markHidden`
//     (`UPDATE … AND bi_an = 0`: 0 hàng ⇒ `AlreadyHidden`, không nhật ký) ⇒ nhật ký `AnDanhGia` CÙNG giao dịch. Thân trả KẾT QUẢ CÓ KIỂU, không ném `AppException` (ném thì lần ghi bị hoàn tác, A8) và chạy lại
//     được: chỉ đọc biến của lần gọi. Lỗi nhật ký (`AuditError`) hay lỗi khác ⇒ hoàn tác cả giao dịch, người dùng nhận 500 chung (KDD-10).
//  4. SAU giao dịch đổi kết quả sang 200 hay lỗi API ở MỘT chỗ (`hideResult`).
// `actorId` CHỈ từ access token; đánh giá CHỈ từ đường dẫn; chi nhánh và bác sĩ của nhật ký CHỈ từ lịch đã đọc ở bước 2.

/** Nhãn của giao dịch cho cảnh báo thử lại (chỉ tên luồng, không dữ liệu). */
export const HIDE_LABEL = 'exam-hide';

@Injectable()
export class RatingHideService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(RatingHideRepository)
    private readonly repository: RatingHideRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** `id` đã qua `ParseRecordIdPipe`; `actorId` là `user.accountId`. Ném `AppException` 400, 404, 409 hoặc 503. */
  async hide(
    scope: AdminScope,
    actorId: string,
    id: string,
    body: HideRatingDto,
  ): Promise<HiddenRatingView> {
    const checked = validateHideReason(body.lyDo);
    if (!checked.ok) throw fieldErrorsException(checked.errors);
    const target = await this.repository.readForHide(this.db, id);
    if (target === null)
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    this.policy.assertCanSee(scope, target.chiNhanhId);
    const outcome = await withBookingTransaction(
      this.db,
      (em) => this.write(em, actorId, target, checked.value),
      { label: HIDE_LABEL },
    );
    return hideResult(target.danhGiaId, outcome);
  }

  private async write(
    em: EntityManager,
    actorId: string,
    target: HideTarget,
    reason: string,
  ): Promise<HideOutcome> {
    const locked = await this.repository.lock(em, target.danhGiaId);
    if (locked === null) return { kind: 'NotFound' };
    if (locked.biAn) return { kind: 'AlreadyHidden' };
    const changed = await this.repository.markHidden(
      em,
      target.danhGiaId,
      reason,
    );
    if (changed === 0) return { kind: 'AlreadyHidden' };
    // Khoá theo khoá chính chỉ có thể trúng 0 hoặc 1 hàng; khác đi là câu SQL sai: ném để HOÀN TÁC, không để lọt một lần ẩn lan sang hàng khác
    if (changed !== 1)
      throw new Error('Lệnh ẩn đánh giá đổi nhiều hơn một hàng');
    await this.audit.record(em, {
      actorId,
      branchId: target.chiNhanhId,
      action: 'AnDanhGia',
      targetType: 'danh_gia_bac_si',
      targetId: target.danhGiaId,
      result: 'ThanhCong',
      changes: {
        truoc: { bi_an: false },
        sau: { bi_an: true },
        ly_do: reason,
        bac_si_id: target.bacSiId,
      },
    });
    return { kind: 'Hidden' };
  }
}
