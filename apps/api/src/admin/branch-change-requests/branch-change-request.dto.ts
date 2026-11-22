import { IsIn, ValidateBy, ValidateIf } from 'class-validator';
import { RequiredReason } from '../../appointments/status/required-reason.decorator.js';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';
import { isPositiveBigintId } from '../branches/branch.dto.js';
import {
  TRANG_THAI_YEU_CAU_THAY_DOI_CHI_NHANH,
  type TrangThaiYeuCauThayDoiChiNhanh,
} from '../entities/enums.js';

// DTO của yêu cầu thay đổi chi nhánh (admin B9; PLAN admin 5.3). Id là chuỗi số nguyên dương trong miền bigint.

const positiveId = (name: string, message: string) =>
  ValidateBy({
    name,
    validator: { validate: isPositiveBigintId, defaultMessage: () => message },
  });

export class BranchChangeRequestListDto extends PageQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(TRANG_THAI_YEU_CAU_THAY_DOI_CHI_NHANH, {
    message: 'TRANG_THAI_KHONG_HOP_LE',
  })
  trangThai?: TrangThaiYeuCauThayDoiChiNhanh;

  /** Chỉ có tác dụng với Quản trị viên Toàn hệ thống; Quản trị viên Chi nhánh luôn bị ép về chi nhánh của mình (service). */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @positiveId('isBranchId', 'MA_CHI_NHANH_KHONG_HOP_LE')
  chiNhanhId?: string;
}

export class BranchChangeRequestIdDto {
  @positiveId('isBranchChangeRequestId', 'MA_YEU_CAU_KHONG_HOP_LE')
  id!: string;
}

/**
 * Thân `POST …/:id/reject`. `lyDo` dùng CHUNG bộ kiểm lý do bắt buộc của booking (như wallet hoàn tiền đặc biệt): sau `trim()` dài 1 đến 255
 * (cột `ly_do_tu_choi varchar(255)`, CN-61) và không giống bí mật (cùng bộ kiểm của `AuditService`, vì lý do được ghi vào audit). Sai ⇒ 400 `LY_DO_BAT_BUOC`.
 */
export class RejectBranchChangeRequestDto {
  @RequiredReason({ rejectSecrets: true })
  lyDo!: string;
}
