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

const VN_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

/**
 * 'YYYY-MM-DD HH:mm:ss' giờ Việt Nam và là thời điểm CÓ THẬT (loại 30/02, 24:00:00): tách số rồi dựng lại bằng `Date.UTC`,
 * các phần phải giữ nguyên (Date tự "tràn" 30/02 sang 02/03 nên so lại là bắt được).
 */
export function isVnDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = VN_DATE_TIME.exec(value);
  if (!match) return false;
  const [y, mo, d, h, mi, s] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    date.getUTCHours() === h &&
    date.getUTCMinutes() === mi &&
    date.getUTCSeconds() === s
  );
}

/**
 * Thân `POST …/:id/approve` (admin B10; Q5). `hieuLucTu` = thời điểm "dự kiến có hiệu lực" người duyệt chọn, dạng giờ VN
 * 'YYYY-MM-DD HH:mm:ss' (cùng dạng B9 trả ra; Trung chốt 22/11/2026). Mốc sớm nhất kiểm ở service (cần cấu hình và giờ duyệt).
 */
export class ApproveBranchChangeRequestDto {
  @ValidateBy({
    name: 'isVnDateTime',
    validator: {
      validate: isVnDateTime,
      defaultMessage: () => 'HIEU_LUC_KHONG_HOP_LE',
    },
  })
  hieuLucTu!: string;
}

/** Thân `POST …/:id/cancel` (admin B21; Q47): cùng bộ kiểm lý do với từ chối (cột `ly_do_huy varchar(255)`, CHECK DB đòi sau trim không rỗng; CN-95). */
export class CancelBranchChangeRequestDto extends RejectBranchChangeRequestDto {}
