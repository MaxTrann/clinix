// Enum của bảng giao_dich_thanh_toan (docs/database/clinix_mysql.sql).
export const LOAI_GIAO_DICH_THANH_TOAN = ['NapVi', 'ThanhToanLichHen'] as const;
export type LoaiGiaoDichThanhToan = (typeof LOAI_GIAO_DICH_THANH_TOAN)[number];

export const PHUONG_THUC_THANH_TOAN = [
  'Vi',
  'VNPay',
  'MoMo',
  'TienMatTaiQuay',
] as const;
export type PhuongThucThanhToan = (typeof PHUONG_THUC_THANH_TOAN)[number];

export const TRANG_THAI_GIAO_DICH_THANH_TOAN = [
  'KhoiTao',
  'DangXuLy',
  'ThanhCong',
  'ThatBai',
  'HetHan',
] as const;
export type TrangThaiGiaoDichThanhToan =
  (typeof TRANG_THAI_GIAO_DICH_THANH_TOAN)[number];

export const TRANG_THAI_DOI_SOAT = [
  'KhongCan',
  'ChoDoiSoat',
  'DaDoiSoat',
] as const;
export type TrangThaiDoiSoat = (typeof TRANG_THAI_DOI_SOAT)[number];
