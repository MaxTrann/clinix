import { Transform } from 'class-transformer';
import { IsString, MaxLength, ValidateBy, ValidateIf } from 'class-validator';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';
import { isPositiveBigintId } from '../branches/branch.dto.js';

// DTO của hồ sơ bác sĩ, phần đọc (admin B12; PLAN admin 5.3). Id là chuỗi số nguyên dương trong miền bigint (không đổi sang number để khỏi mất chính xác).

/** Độ dài tối đa của từ khoá tìm kiếm [đề xuất]: đủ cho họ tên (100) hoặc email. */
export const DOCTOR_SEARCH_MAX_LENGTH = 100;

const optionalId = (name: string, message: string) =>
  ValidateBy({
    name,
    validator: {
      validate: isPositiveBigintId,
      defaultMessage: () => message,
    },
  });

// Chuỗi rỗng sau khi trim coi như không lọc (ô tìm kiếm bị xoá trắng)
const trimToUndefined = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class DoctorListDto extends PageQueryDto {
  @Transform(trimToUndefined)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString({ message: 'TU_KHOA_KHONG_HOP_LE' })
  @MaxLength(DOCTOR_SEARCH_MAX_LENGTH, { message: 'TU_KHOA_QUA_DAI' })
  q?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @optionalId('isSpecialtyId', 'MA_CHUYEN_KHOA_KHONG_HOP_LE')
  chuyenKhoaId?: string;

  /** Chỉ có tác dụng với Quản trị viên Toàn hệ thống; Quản trị viên Chi nhánh luôn bị ép về chi nhánh của mình (service). */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @optionalId('isBranchId', 'MA_CHI_NHANH_KHONG_HOP_LE')
  chiNhanhId?: string;
}

export class DoctorIdDto {
  @optionalId('isDoctorId', 'MA_BAC_SI_KHONG_HOP_LE')
  id!: string;
}
