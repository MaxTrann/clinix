import { Transform } from 'class-transformer';
import { IsString, Length, ValidateBy } from 'class-validator';
import { IsAccountEmail } from '../../auth/dto/account-field.decorators.js';
import { trimAsciiWhitespace } from '../../auth/validation/ascii-text.js';

const normalizeRequiredText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? trimAsciiWhitespace(value) : value;

export function normalizeHotline(raw: string): string {
  return raw.replace(/[\s.-]/gu, '');
}

export function isValidHotline(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 20 &&
    /^(?:0[0-9]{9}|(?:1800|1900)[0-9]{4,6})$/.test(value)
  );
}

export class UpdateClinicInfoDto {
  @Transform(normalizeRequiredText)
  @IsString({ message: 'TEN_THUONG_HIEU_KHONG_HOP_LE' })
  @Length(1, 100, { message: 'TEN_THUONG_HIEU_KHONG_HOP_LE' })
  tenThuongHieu!: string;

  @Transform(normalizeRequiredText)
  @IsString({ message: 'DIA_CHI_TRU_SO_KHONG_HOP_LE' })
  @Length(1, 255, { message: 'DIA_CHI_TRU_SO_KHONG_HOP_LE' })
  diaChiTruSo!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeHotline(value) : value,
  )
  @ValidateBy({
    name: 'isValidHotline',
    validator: {
      validate: isValidHotline,
      defaultMessage: () => 'DUONG_DAY_NONG_KHONG_HOP_LE',
    },
  })
  duongDayNong!: string;

  @IsAccountEmail()
  email!: string;
}
