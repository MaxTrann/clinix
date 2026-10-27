// Enum dùng bởi các entity danh mục admin (docs/database/clinix_mysql.sql).
export const TRANG_THAI_HOAT_DONG = ['DangHoatDong', 'NgungHoatDong'] as const;
export type TrangThaiHoatDong = (typeof TRANG_THAI_HOAT_DONG)[number];

export const HOC_VI_BAC_SI = ['BS', 'ThS', 'TS', 'PGS', 'GS'] as const;
export type HocViBacSi = (typeof HOC_VI_BAC_SI)[number];

export const CHUC_DANH_BAC_SI = [
  'BS',
  'BS_CKI',
  'BS_CKII',
  'ThS_BS',
  'TS_BS',
  'PGS_TS_BS',
  'GS_TS_BS',
] as const;
export type ChucDanhBacSi = (typeof CHUC_DANH_BAC_SI)[number];

export const PHAM_VI_QUAN_TRI = ['ToanHeThong', 'ChiNhanh'] as const;
export type PhamViQuanTri = (typeof PHAM_VI_QUAN_TRI)[number];

export const MOI_QUAN_HE_NGUOI_THAN = [
  'Cha',
  'Me',
  'Vo',
  'Chong',
  'Con',
  'AnhChiEm',
  'OngBa',
  'Khac',
] as const;
export type MoiQuanHeNguoiThan = (typeof MOI_QUAN_HE_NGUOI_THAN)[number];

export const CA_LAM_VIEC = ['CaSang', 'CaChieu', 'CaToi'] as const;
export type CaLamViec = (typeof CA_LAM_VIEC)[number];

export const TRANG_THAI_KHUNG_GIO = [
  'ConTrong',
  'DaDat',
  'DangGiuCho',
  'HetHan',
] as const;
export type TrangThaiKhungGio = (typeof TRANG_THAI_KHUNG_GIO)[number];

export const TRANG_THAI_LICH_HEN = [
  'ChoThanhToan',
  'DaXacNhan',
  'DaTiepDon',
  'HoanThanh',
  'DaHuy',
  'DaDoiLich',
  'VangMat',
] as const;
export type TrangThaiLichHen = (typeof TRANG_THAI_LICH_HEN)[number];
