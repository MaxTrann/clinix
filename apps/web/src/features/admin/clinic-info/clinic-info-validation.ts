import type {
  ClinicInfoField,
  ClinicInfoInput,
} from './clinic-info-types';

export type ClinicInfoFieldErrors = Partial<
  Record<ClinicInfoField, string>
>;

const FIELD_ERRORS: Record<string, string> = {
  TEN_THUONG_HIEU_KHONG_HOP_LE:
    'Tên thương hiệu cần có từ 1 đến 100 ký tự.',
  DIA_CHI_TRU_SO_KHONG_HOP_LE:
    'Địa chỉ trụ sở chính cần có từ 1 đến 255 ký tự.',
  DUONG_DAY_NONG_KHONG_HOP_LE: 'Đường dây nóng không đúng định dạng.',
  EMAIL_KHONG_HOP_LE: 'Email liên hệ chung không đúng định dạng.',
};

export function trimAsciiWhitespace(value: string): string {
  return value.replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g, '');
}

export function validateClinicInfo(
  values: ClinicInfoInput,
  emailHasTypeMismatch: boolean,
): ClinicInfoFieldErrors {
  const errors: ClinicInfoFieldErrors = {};
  const brandName = trimAsciiWhitespace(values.tenThuongHieu);
  const address = trimAsciiWhitespace(values.diaChiTruSo);

  if (brandName.length < 1 || brandName.length > 100) {
    errors.tenThuongHieu =
      'Tên thương hiệu cần có từ 1 đến 100 ký tự.';
  }
  if (address.length < 1 || address.length > 255) {
    errors.diaChiTruSo =
      'Địa chỉ trụ sở chính cần có từ 1 đến 255 ký tự.';
  }

  const hotline = values.duongDayNong.replace(/[\s.-]/gu, '');
  if (!/^(?:0[0-9]{9}|(?:1800|1900)[0-9]{4,6})$/.test(hotline)) {
    errors.duongDayNong = 'Đường dây nóng không đúng định dạng.';
  }

  const email = trimAsciiWhitespace(values.email);
  if (
    email.length === 0 ||
    email.length > 255 ||
    emailHasTypeMismatch
  ) {
    errors.email = 'Email liên hệ chung không đúng định dạng.';
  }

  return errors;
}

export function clinicInfoFieldError(code: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(FIELD_ERRORS, code)
    ? FIELD_ERRORS[code]
    : undefined;
}
