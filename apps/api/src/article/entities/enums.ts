// Enum của scope "Bài viết" (article B1). Thứ tự giá trị đúng ENUM của docs/database/clinix_mysql.sql.

/** `bai_viet.trang_thai`: bản nháp, đã xuất bản (công khai thấy), lưu trữ/ẩn (PLAN article 5.3). */
export const TRANG_THAI_BAI_VIET = [
  'BanNhap',
  'DaXuatBan',
  'LuuTruAn',
] as const;
export type TrangThaiBaiViet = (typeof TRANG_THAI_BAI_VIET)[number];

/** `benh_nhan_danh_gia_bai_viet.loai`: Thích hay Không thích (dùng ở article B3). */
export const LOAI_DANH_GIA_BAI_VIET = ['Thich', 'KhongThich'] as const;
export type LoaiDanhGiaBaiViet = (typeof LOAI_DANH_GIA_BAI_VIET)[number];
