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

const isPositiveDecimal = (value: unknown): boolean => {
  if (typeof value !== 'string' || !/^\d{1,10}(?:\.\d{1,2})?$/u.test(value))
    return false;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(`${whole}${fraction.padEnd(2, '0')}`) > 0n;
};

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
    name: 'isPositiveDecimal',
    validator: {
      validate: isPositiveDecimal,
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
    name: 'isPositiveDecimal',
    validator: {
      validate: isPositiveDecimal,
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
