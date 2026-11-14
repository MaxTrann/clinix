import type { EntityManager } from 'typeorm';

// Chân thư từ `thong_tin_phong_kham` (bảng MỘT dòng, id = 1; PLAN booking 5.12, L32, Q30; TB-04). Một câu SQL chỉ đọc ở đây, KHÔNG import `search/` hay `PublicClinicInfoRepository` (tránh kéo module khác vào worker).
// Thiếu cột (NULL hay chuỗi trắng) thì mẫu thư bỏ dòng tương ứng; thiếu cả dòng thì `null` và thư chỉ còn chữ cố định.

export interface ClinicFooter {
  tenThuongHieu: string | null;
  diaChi: string | null;
  hotline: string | null;
  email: string | null;
}

export const READ_CLINIC_FOOTER_SQL =
  'SELECT ten_thuong_hieu AS tenThuongHieu, dia_chi_tru_so AS diaChi, duong_day_nong AS hotline, email FROM thong_tin_phong_kham WHERE id = 1';

const blankToNull = (value: string | null | undefined): string | null =>
  value === null || value === undefined || value.trim() === ''
    ? null
    : value.trim();

/** Chân thư của phòng khám, hoặc `null` khi chưa có dòng cấu hình. */
export async function readClinicFooter(
  em: EntityManager,
): Promise<ClinicFooter | null> {
  const rows: Partial<Record<keyof ClinicFooter, string | null>>[] =
    await em.query(READ_CLINIC_FOOTER_SQL);
  const row = rows[0];
  if (row === undefined) return null;
  return {
    tenThuongHieu: blankToNull(row.tenThuongHieu),
    diaChi: blankToNull(row.diaChi),
    hotline: blankToNull(row.hotline),
    email: blankToNull(row.email),
  };
}
