// Enum dùng bởi các entity danh mục admin (docs/database/clinix_mysql.sql).
export const TRANG_THAI_HOAT_DONG = [
  'DangHoatDong',
  'NgungHoatDong',
] as const;
export type TrangThaiHoatDong = (typeof TRANG_THAI_HOAT_DONG)[number];
