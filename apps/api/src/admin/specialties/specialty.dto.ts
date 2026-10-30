import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';
import {
  TRANG_THAI_HOAT_DONG,
  type TrangThaiHoatDong,
} from '../entities/enums.js';

export const normalizeSpecialtyName = (value: string): string =>
  value.trim().replace(/\s+/gu, ' ');

const cleanName = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeSpecialtyName(value) : value;

class SpecialtyFieldsDto {
  @IsOptional()
  @IsString({ message: 'MO_TA_KHONG_HOP_LE' })
  @MaxLength(5000, { message: 'MO_TA_QUA_DAI' })
  moTa?: string | null;

  @IsOptional()
  @IsUUID('all', { message: 'ANH_TAI_LEN_KHONG_HOP_LE' })
  imageUploadId?: string | null;
}

export class CreateSpecialtyDto extends SpecialtyFieldsDto {
  @Transform(cleanName)
  @IsString({ message: 'TEN_CHUYEN_KHOA_KHONG_HOP_LE' })
  @Length(1, 100, { message: 'TEN_CHUYEN_KHOA_KHONG_HOP_LE' })
  ten!: string;
}

export class UpdateSpecialtyDto extends SpecialtyFieldsDto {
  // undefined là bỏ qua; null không được xem là tên hợp lệ.
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(cleanName)
  @IsString({ message: 'TEN_CHUYEN_KHOA_KHONG_HOP_LE' })
  @Length(1, 100, { message: 'TEN_CHUYEN_KHOA_KHONG_HOP_LE' })
  ten?: string;
}

export class SpecialtyStatusDto {
  @IsIn(TRANG_THAI_HOAT_DONG, { message: 'TRANG_THAI_KHONG_HOP_LE' })
  trangThaiHoatDong!: TrangThaiHoatDong;
}

export class SpecialtySearchDto extends PageQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'TU_KHOA_KHONG_HOP_LE' })
  @MaxLength(200, { message: 'TU_KHOA_QUA_DAI' })
  q?: string;
}

export class SpecialtyListDto extends SpecialtySearchDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(TRANG_THAI_HOAT_DONG, { message: 'TRANG_THAI_KHONG_HOP_LE' })
  trangThaiHoatDong?: TrangThaiHoatDong;
}

export class SpecialtyIdDto {
  @ValidateBy({
    name: 'isSpecialtyId',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' &&
        /^[1-9]\d{0,18}$/.test(value) &&
        BigInt(value) <= 9223372036854775807n,
      defaultMessage: () => 'MA_CHUYEN_KHOA_KHONG_HOP_LE',
    },
  })
  id!: string;
}
