export interface ClinicInfo {
  tenThuongHieu: string | null;
  diaChiTruSo: string | null;
  duongDayNong: string | null;
  email: string | null;
}

export interface ClinicInfoInput {
  tenThuongHieu: string;
  diaChiTruSo: string;
  duongDayNong: string;
  email: string;
}

export type ClinicInfoField = keyof ClinicInfoInput;
