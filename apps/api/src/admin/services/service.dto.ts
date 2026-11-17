import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';

export const normalizeServiceName = (value: string): string =>
  value.trim().replace(/\s+/gu, ' ');

const cleanName = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeServiceName(value) : value;

const isPositiveBigint = (value: unknown): boolean =>
  typeof value === 'string' &&
  /^[1-9]\d{0,18}$/u.test(value) &&
  BigInt(value) <= 9223372036854775807n;

// Giá là số nguyên đồng (PR3 Admin Catalog, khớp ô giá của web): 1 đến 10 chữ số ASCII, không số 0 đứng đầu, nên luôn ≥ 1 và
// ≤ 9.999.999.999, vừa cột `decimal(12,2)`. Không nhận phần lẻ kể cả ".00"; giá cũ có phần lẻ trong DB vẫn đọc ra đúng như DB.
const WHOLE_AMOUNT = /^[1-9][0-9]{0,9}$/u;
const isPositiveWholeAmount = (value: unknown): boolean =>
  typeof value === 'string' && WHOLE_AMOUNT.test(value);

export class CreateServiceDto {
  @ValidateBy({
    name: 'isServiceGroupId',
    validator: {
      validate: isPositiveBigint,
      defaultMessage: () => 'NHOM_DICH_VU_ID_KHONG_HOP_LE',
    },
  })
  nhomDichVuId!: string;

  @Transform(cleanName)
  @IsString({ message: 'TEN_DICH_VU_KHONG_HOP_LE' })
  @Length(1, 100, { message: 'TEN_DICH_VU_KHONG_HOP_LE' })
  ten!: string;

  @IsInt({ message: 'THOI_LUONG_KHONG_HOP_LE' })
  @Min(1, { message: 'THOI_LUONG_KHONG_HOP_LE' })
  @Max(2147483647, { message: 'THOI_LUONG_KHONG_HOP_LE' })
  thoiLuong!: number;

  @IsString({ message: 'GIA_MAC_DINH_KHONG_HOP_LE' })
  @ValidateBy({
    name: 'isPositiveWholeAmount',
    validator: {
      validate: isPositiveWholeAmount,
      defaultMessage: () => 'GIA_MAC_DINH_KHONG_HOP_LE',
    },
  })
  giaMacDinh!: string;
}

export class UpdateServiceDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @ValidateBy({
    name: 'isServiceGroupId',
    validator: {
      validate: isPositiveBigint,
      defaultMessage: () => 'NHOM_DICH_VU_ID_KHONG_HOP_LE',
    },
  })
  nhomDichVuId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(cleanName)
  @IsString({ message: 'TEN_DICH_VU_KHONG_HOP_LE' })
  @Length(1, 100, { message: 'TEN_DICH_VU_KHONG_HOP_LE' })
  ten?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt({ message: 'THOI_LUONG_KHONG_HOP_LE' })
  @Min(1, { message: 'THOI_LUONG_KHONG_HOP_LE' })
  @Max(2147483647, { message: 'THOI_LUONG_KHONG_HOP_LE' })
  thoiLuong?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString({ message: 'GIA_MAC_DINH_KHONG_HOP_LE' })
  @ValidateBy({
    name: 'isPositiveWholeAmount',
    validator: {
      validate: isPositiveWholeAmount,
      defaultMessage: () => 'GIA_MAC_DINH_KHONG_HOP_LE',
    },
  })
  giaMacDinh?: string;
}

export class ServiceListDto extends PageQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'TU_KHOA_KHONG_HOP_LE' })
  @MaxLength(200, { message: 'TU_KHOA_QUA_DAI' })
  q?: string;
}

export class ServiceIdDto {
  @ValidateBy({
    name: 'isServiceId',
    validator: {
      validate: isPositiveBigint,
      defaultMessage: () => 'MA_DICH_VU_KHONG_HOP_LE',
    },
  })
  id!: string;
}
