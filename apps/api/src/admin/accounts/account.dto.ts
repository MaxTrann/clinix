import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import {
  LOAI_TAI_KHOAN,
  TRANG_THAI_TAI_KHOAN,
  type LoaiTaiKhoan,
  type TrangThaiTaiKhoan,
} from '../../auth/entities/enums.js';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';

export const KHOA_NO_SHOW_VALUES = ['true', 'false'] as const;
export type KhoaNoShowFilter = (typeof KHOA_NO_SHOW_VALUES)[number];

// Id bigint dạng chuỗi (khớp `BranchIdDto`): bỏ số 0 đứng đầu, tối đa 2^63 - 1.
const isBigintId = (value: unknown): boolean =>
  typeof value === 'string' &&
  /^[1-9]\d{0,18}$/u.test(value) &&
  BigInt(value) <= 9223372036854775807n;

// `?vaiTro=BacSi` là chuỗi, `?vaiTro=BacSi&vaiTro=LeTan` là mảng: chuẩn hoá về mảng để kiểm một kiểu.
// Giá trị lạ (ví dụ `vaiTro[a]=b` thành object) vẫn được giữ nguyên để IsIn từ chối.
const toArray = ({ value }: { value: unknown }): unknown =>
  value === undefined || Array.isArray(value) ? value : [value];

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const isPresent = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class AccountListDto extends PageQueryDto {
  @ValidateIf(isPresent)
  @Transform(toArray)
  @IsArray({ message: 'VAI_TRO_KHONG_HOP_LE' })
  @ArrayMinSize(1, { message: 'VAI_TRO_KHONG_HOP_LE' })
  @ArrayMaxSize(LOAI_TAI_KHOAN.length, { message: 'VAI_TRO_KHONG_HOP_LE' })
  @ArrayUnique({ message: 'VAI_TRO_KHONG_HOP_LE' })
  @IsIn(LOAI_TAI_KHOAN, { each: true, message: 'VAI_TRO_KHONG_HOP_LE' })
  vaiTro?: LoaiTaiKhoan[];

  @ValidateIf(isPresent)
  @IsIn(TRANG_THAI_TAI_KHOAN, { message: 'TRANG_THAI_KHONG_HOP_LE' })
  trangThai?: TrangThaiTaiKhoan;

  // Cờ khoá đặt lịch do no-show: chỉ Bệnh nhân có. Admin Chi nhánh không được dùng (service trả 403).
  @ValidateIf(isPresent)
  @IsIn(KHOA_NO_SHOW_VALUES, { message: 'KHOA_NO_SHOW_KHONG_HOP_LE' })
  khoaNoShow?: KhoaNoShowFilter;

  @ValidateIf(isPresent)
  @ValidateBy({
    name: 'isBranchId',
    validator: {
      validate: isBigintId,
      defaultMessage: () => 'MA_CHI_NHANH_KHONG_HOP_LE',
    },
  })
  chiNhanhId?: string;

  @ValidateIf(isPresent)
  @Transform(trimText)
  @IsString({ message: 'TU_KHOA_KHONG_HOP_LE' })
  @MaxLength(200, { message: 'TU_KHOA_QUA_DAI' })
  q?: string;
}

export class AccountIdDto {
  @ValidateBy({
    name: 'isAccountId',
    validator: {
      validate: isBigintId,
      defaultMessage: () => 'MA_TAI_KHOAN_KHONG_HOP_LE',
    },
  })
  id!: string;
}
