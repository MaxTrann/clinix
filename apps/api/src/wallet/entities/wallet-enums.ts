// Enum của các bảng ví (docs/database/clinix_mysql.sql).
export const LOAI_GIAO_DICH_VI = [
  'Nap',
  'ThanhToan',
  'HoanTien',
  'Rut',
] as const;
export type LoaiGiaoDichVi = (typeof LOAI_GIAO_DICH_VI)[number];

// TuDong: hoàn cọc khi huỷ lịch (kể cả thử lại); DacBiet: Quản trị viên hoàn đặc biệt (Q23).
export const LOAI_HOAN_TIEN = ['TuDong', 'DacBiet'] as const;
export type LoaiHoanTien = (typeof LOAI_HOAN_TIEN)[number];

export const KET_QUA_HOAN_TIEN = ['ThanhCong', 'ThatBai'] as const;
export type KetQuaHoanTien = (typeof KET_QUA_HOAN_TIEN)[number];

export const TRANG_THAI_YEU_CAU_RUT_TIEN = [
  'ChoDuyet',
  'DaDuyet',
  'TuChoi',
] as const;
export type TrangThaiYeuCauRutTien =
  (typeof TRANG_THAI_YEU_CAU_RUT_TIEN)[number];

export const KET_QUA_DOI_SOAT = [
  'ThanhCong',
  'ThatBai',
  'KhongTheXuLy',
] as const;
export type KetQuaDoiSoat = (typeof KET_QUA_DOI_SOAT)[number];
