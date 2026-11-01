import { Transform, Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsString,
  Length,
  MaxLength,
  ValidateBy,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';

export const normalizeBranchName = (value: string): string =>
  value.trim().replace(/\s+/gu, ' ');
export const normalizeBranchAddress = (value: string): string => value.trim();

const normalizeName = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeBranchName(value) : value;
const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeBranchAddress(value) : value;

const isPositiveBigintId = (value: unknown): boolean =>
  typeof value === 'string' &&
  /^[1-9]\d{0,18}$/u.test(value) &&
  BigInt(value) <= 9223372036854775807n;

const isCoordinate = (value: unknown, limit: number): boolean =>
  typeof value === 'string' &&
  /^[+-]?\d+(?:\.\d{1,7})?$/u.test(value) &&
  Number.isFinite(Number(value)) &&
  Math.abs(Number(value)) <= limit;

export class BranchPeriodDto {
  @Allow()
  batDau?: string;

  @Allow()
  ketThuc?: string;
}

export class BranchScheduleDto {
  @Allow()
  thuTrongTuan?: number;

  @Allow()
  hoatDong?: boolean;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @ValidateNested()
  @Type(() => BranchPeriodDto)
  sang?: BranchPeriodDto | null;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @ValidateNested()
  @Type(() => BranchPeriodDto)
  chieu?: BranchPeriodDto | null;
}

export class BranchListDto extends PageQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'TU_KHOA_KHONG_HOP_LE' })
  @MaxLength(200, { message: 'TU_KHOA_QUA_DAI' })
  q?: string;
}

export class BranchIdDto {
  @ValidateBy({
    name: 'isBranchId',
    validator: {
      validate: isPositiveBigintId,
      defaultMessage: () => 'MA_CHI_NHANH_KHONG_HOP_LE',
    },
  })
  id!: string;
}

export class CreateBranchDto {
  @Transform(normalizeName)
  @IsString({ message: 'TEN_CHI_NHANH_KHONG_HOP_LE' })
  @Length(1, 100, { message: 'TEN_CHI_NHANH_KHONG_HOP_LE' })
  ten!: string;

  @Transform(trimText)
  @IsString({ message: 'DIA_CHI_CHI_NHANH_KHONG_HOP_LE' })
  @Length(1, 255, { message: 'DIA_CHI_CHI_NHANH_KHONG_HOP_LE' })
  diaChi!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @ValidateBy({
    name: 'isBranchLatitude',
    validator: {
      validate: (value: unknown) => isCoordinate(value, 90),
      defaultMessage: () => 'TOA_DO_KHONG_HOP_LE',
    },
  })
  toaDoLat?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @ValidateBy({
    name: 'isBranchLongitude',
    validator: {
      validate: (value: unknown) => isCoordinate(value, 180),
      defaultMessage: () => 'TOA_DO_KHONG_HOP_LE',
    },
  })
  toaDoLng?: string;

  @IsArray({ message: 'LICH_HOAT_DONG_KHONG_HOP_LE' })
  @ValidateNested({ each: true })
  @Type(() => BranchScheduleDto)
  lichHoatDong!: BranchScheduleDto[];

  @IsArray({ message: 'DANH_SACH_DICH_VU_KHONG_HOP_LE' })
  @ValidateBy(
    {
      name: 'isPositiveBigintId',
      validator: { validate: isPositiveBigintId },
    },
    { each: true, message: 'MA_DICH_VU_KHONG_HOP_LE' },
  )
  dichVuKhamIds!: string[];
}
