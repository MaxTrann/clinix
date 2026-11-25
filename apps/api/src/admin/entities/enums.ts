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

export const TRANG_THAI_YEU_CAU_THAY_DOI_CHI_NHANH = [
  'ChoDuyet',
  'DaDuyet',
  'TuChoi',
  'DaRut',
  'DaHuy',
] as const;
export type TrangThaiYeuCauThayDoiChiNhanh =
  (typeof TRANG_THAI_YEU_CAU_THAY_DOI_CHI_NHANH)[number];

// Yêu cầu đổi lịch ngoài chính sách (reschedule P1): ENUM `trang_thai` của bảng yeu_cau_doi_lich_ngoai_chinh_sach.
export const TRANG_THAI_YEU_CAU_DOI_LICH = [
  'ChoDuyet',
  'DaDuyet',
  'TuChoi',
] as const;
export type TrangThaiYeuCauDoiLich =
  (typeof TRANG_THAI_YEU_CAU_DOI_LICH)[number];

export const LY_DO_ANH_HUONG_LICH_HEN = [
  'NgayNghi',
  'NgoaiGioHoatDong',
  'BoDichVu',
] as const;
export type LyDoAnhHuongLichHen = (typeof LY_DO_ANH_HUONG_LICH_HEN)[number];

export const TRANG_THAI_EMAIL_THONG_BAO = [
  'ChoGui',
  'DaGui',
  'ThatBai',
  'BoQua',
] as const;
export type TrangThaiEmailThongBao =
  (typeof TRANG_THAI_EMAIL_THONG_BAO)[number];

// `nhac_lich_hen.trang_thai` (notification P1). Không có `BoQua` như email_thong_bao: nhắc lịch hết lần thử thì giữ ThatBai.
export const TRANG_THAI_NHAC_LICH_HEN = ['ChoGui', 'DaGui', 'ThatBai'] as const;
export type TrangThaiNhacLichHen = (typeof TRANG_THAI_NHAC_LICH_HEN)[number];

// Bản sao ĐỦ ENUM `nhat_ky_hanh_dong.hanh_dong` của DB (audit-enum-parity so tập hợp ba nguồn); `DoiLichHo` thêm ở reschedule P1,
// luật kiểm của nó ở `audit/` là việc của reschedule P2.
export const HANH_DONG_NHAY_CAM = [
  'DoiQuyen',
  'OverrideLichHen',
  'HoanTienDacBiet',
  'DoiChiNhanhBacSi',
  'ChinhNoShow',
  'AnDanhGia',
  'XuLyDoiLichNgoaiChinhSach',
  'SuaGhiChuKham',
  'BacSiHuyDotXuat',
  'CapNhatCauHinh',
  'XuLyNapViChuaCong',
  'TaoTaiKhoanNhanSu',
  'KhoaTaiKhoan',
  'MoKhoaTaiKhoan',
  'MoKhoaNoShow',
  'DuyetThayDoiChiNhanh',
  'TuChoiThayDoiChiNhanh',
  'RutThayDoiChiNhanh',
  'HuyThayDoiChiNhanh',
  'DoiHieuLucThayDoiChiNhanh',
  'PhanCongLichLamViec',
  'GoLichLamViec',
  'DuyetNghiPhep',
  'TuChoiNghiPhep',
  'DuyetRutTien',
  'TuChoiRutTien',
  'DoiLichHo',
] as const;
export type HanhDongNhayCam = (typeof HANH_DONG_NHAY_CAM)[number];

export const LOAI_DOI_TUONG_NHAT_KY = [
  'tai_khoan',
  'benh_nhan',
  'lich_hen',
  'ho_so_kham',
  'danh_gia_bac_si',
  'giao_dich_thanh_toan',
  'yeu_cau_doi_lich_ngoai_chinh_sach',
  'cau_hinh_he_thong',
  'yeu_cau_thay_doi_chi_nhanh',
  'lich_lam_viec',
  'yeu_cau_nghi_phep',
  'yeu_cau_rut_tien',
] as const;
export type LoaiDoiTuongNhatKy = (typeof LOAI_DOI_TUONG_NHAT_KY)[number];
