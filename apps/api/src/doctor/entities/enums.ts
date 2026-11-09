// Enum của bảng yeu_cau_nghi_phep (docs/database/clinix_mysql.sql).
export const HINH_THUC_NGHI = ['CaNgay', 'TheoCa'] as const;
export type HinhThucNghi = (typeof HINH_THUC_NGHI)[number];

export const TRANG_THAI_YEU_CAU_NGHI_PHEP = [
  'ChoDuyet',
  'DaDuyet',
  'TuChoi',
] as const;
export type TrangThaiYeuCauNghiPhep =
  (typeof TRANG_THAI_YEU_CAU_NGHI_PHEP)[number];
