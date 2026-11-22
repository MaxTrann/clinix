import { Transform } from 'class-transformer';
import { IsString, MaxLength, ValidateBy, ValidateIf } from 'class-validator';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';
import { isPositiveBigintId } from '../branches/branch.dto.js';
import {
  CHUC_DANH_BAC_SI,
  HOC_VI_BAC_SI,
  type ChucDanhBacSi,
  type HocViBacSi,
} from '../entities/enums.js';
import { isValidExperienceYears } from '../staff-accounts/staff-account-rules.js';
import { STAFF_ACCOUNT_FIELD_CODES } from '../staff-accounts/staff-account.errors.js';

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

/** Độ dài tối đa của mô tả chuyên môn sau trim [đề xuất] (Trung chốt 22/11/2026: cùng giới hạn mô tả chuyên khoa B1). */
export const DOCTOR_DESCRIPTION_MAX_LENGTH = 5000;

const isOneOf = (list: readonly string[]) => (value: unknown) =>
  typeof value === 'string' && list.includes(value);
const field = (
  name: string,
  message: string,
  validate: (value: unknown) => boolean,
) =>
  ValidateBy({ name, validator: { validate, defaultMessage: () => message } });

// Mô tả: bỏ trường = giữ nguyên (như PATCH chuyên khoa B1); null hay chỉ khoảng trắng = xoá (BS-03)
const trimDescription = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};
const isDescription = (value: unknown): boolean =>
  value === null ||
  (typeof value === 'string' && value.length <= DOCTOR_DESCRIPTION_MAX_LENGTH);

/**
 * Thân `PATCH /admin/doctors/:id` (admin B13; PLAN 5.7, BS b3–b5): form đầy đủ như Figma. Sáu trường hồ sơ BẮT BUỘC gửi tường minh (BS-04, H8: DB tự cho
 * `BS`/`0` nếu bỏ trống nên server không bao giờ tự điền). Mã trường dùng chung với tạo nhân sự B15 để FE dùng một bộ thông báo.
 * Họ tên, email, SĐT, trạng thái tài khoản KHÔNG sửa ở đây (thuộc quản lý tài khoản): gửi lên là trường lạ ⇒ 400.
 */
export class UpdateDoctorProfileDto {
  @field(
    'isSpecialtyId',
    STAFF_ACCOUNT_FIELD_CODES.specialty,
    isPositiveBigintId,
  )
  chuyenKhoaId!: string;

  @field('isBranchId', STAFF_ACCOUNT_FIELD_CODES.branch, isPositiveBigintId)
  chiNhanhId!: string;

  @field('isServiceId', STAFF_ACCOUNT_FIELD_CODES.serviceId, isPositiveBigintId)
  dichVuKhamId!: string;

  @field('isTitle', STAFF_ACCOUNT_FIELD_CODES.title, isOneOf(CHUC_DANH_BAC_SI))
  chucDanh!: ChucDanhBacSi;

  @field('isDegree', STAFF_ACCOUNT_FIELD_CODES.degree, isOneOf(HOC_VI_BAC_SI))
  hocVi!: HocViBacSi;

  @field(
    'isExperience',
    STAFF_ACCOUNT_FIELD_CODES.experience,
    isValidExperienceYears,
  )
  soNamKinhNghiem!: number;

  @Transform(trimDescription)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @field('isDescription', 'MO_TA_CHUYEN_MON_KHONG_HOP_LE', isDescription)
  moTaChuyenMon?: string | null;
}
