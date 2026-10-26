// Các ENUM của DB (docs/database/clinix_mysql.sql) dùng cho 5 bảng của module auth.

export const TRANG_THAI_TAI_KHOAN = [
  'ChoKichHoat',
  'DangHoatDong',
  'NgungHoatDong',
] as const;
export type TrangThaiTaiKhoan = (typeof TRANG_THAI_TAI_KHOAN)[number];

export const LOAI_TAI_KHOAN = [
  'BenhNhan',
  'BacSi',
  'LeTan',
  'QuanTriVien',
] as const;
export type LoaiTaiKhoan = (typeof LOAI_TAI_KHOAN)[number];

// KichHoatNhanSu thuộc module admin; auth chỉ dùng DangKy và QuenMatKhau.
export const LOAI_XAC_THUC = [
  'DangKy',
  'QuenMatKhau',
  'KichHoatNhanSu',
] as const;
export type LoaiXacThuc = (typeof LOAI_XAC_THUC)[number];
