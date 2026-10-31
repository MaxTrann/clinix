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

export const normalizeGroupName = (value: string): string =>
  value.trim().replace(/\s+/gu, ' ');
const cleanName = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeGroupName(value) : value;

class GroupOrderDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt({ message: 'THU_TU_HIEN_THI_KHONG_HOP_LE' })
  @Min(0, { message: 'THU_TU_HIEN_THI_KHONG_HOP_LE' })
  @Max(2147483647, { message: 'THU_TU_HIEN_THI_KHONG_HOP_LE' })
  thuTuHienThi?: number;
}

export class CreateServiceGroupDto extends GroupOrderDto {
  @Transform(cleanName)
  @IsString({ message: 'TEN_NHOM_DICH_VU_KHONG_HOP_LE' })
  @Length(1, 100, { message: 'TEN_NHOM_DICH_VU_KHONG_HOP_LE' })
  ten!: string;
}

export class UpdateServiceGroupDto extends GroupOrderDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(cleanName)
  @IsString({ message: 'TEN_NHOM_DICH_VU_KHONG_HOP_LE' })
  @Length(1, 100, { message: 'TEN_NHOM_DICH_VU_KHONG_HOP_LE' })
  ten?: string;
}

export class ServiceGroupListDto extends PageQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'TU_KHOA_KHONG_HOP_LE' })
  @MaxLength(200, { message: 'TU_KHOA_QUA_DAI' })
  q?: string;
}

export class ServiceGroupIdDto {
  @ValidateBy({
    name: 'isServiceGroupId',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' &&
        /^[1-9]\d{0,18}$/.test(value) &&
        BigInt(value) <= 9223372036854775807n,
      defaultMessage: () => 'MA_NHOM_DICH_VU_KHONG_HOP_LE',
    },
  })
  id!: string;
}
