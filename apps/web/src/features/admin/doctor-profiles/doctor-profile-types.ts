// Kiểu dữ liệu của màn "Quản lý hồ sơ bác sĩ" (admin F7), khớp phản hồi của API B12 (đọc) và B13 (sửa). Tiền là CHUỖI decimal ("350000.00").

export type AccountStatus = 'ChoKichHoat' | 'DangHoatDong' | 'NgungHoatDong';

export const DOCTOR_TITLES = [
  'BS',
  'BS_CKI',
  'BS_CKII',
  'ThS_BS',
  'TS_BS',
  'PGS_TS_BS',
  'GS_TS_BS',
] as const;
export type DoctorTitle = (typeof DOCTOR_TITLES)[number];

export const DOCTOR_DEGREES = ['BS', 'ThS', 'TS', 'PGS', 'GS'] as const;
export type DoctorDegree = (typeof DOCTOR_DEGREES)[number];

export interface DoctorListItem {
  taiKhoanId: string;
  hoTen: string;
  email: string;
  /** 'YYYY-MM-DD' hoặc `null` */
  ngaySinh: string | null;
  anhDaiDien: string | null;
  trangThaiTaiKhoan: AccountStatus;
  chucDanh: DoctorTitle;
  hocVi: DoctorDegree;
  soNamKinhNghiem: number;
  chuyenKhoa: { chuyenKhoaId: string; ten: string };
  chiNhanh: { chiNhanhId: string; ten: string };
  dichVuKham: { dichVuKhamId: string; ten: string };
  giaMacDinh: string;
  phuPhi: string;
  giaKham: string;
}

export interface DoctorDetail extends Omit<DoctorListItem, 'chuyenKhoa'> {
  soDienThoai: string;
  moTaChuyenMon: string | null;
  chuyenKhoa: {
    chuyenKhoaId: string;
    ten: string;
    trangThaiHoatDong: 'DangHoatDong' | 'NgungHoatDong';
  };
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Thân `PATCH /admin/doctors/:id` (B13): form đầy đủ. `moTaChuyenMon` null = xoá mô tả. */
export interface DoctorProfileInput {
  chuyenKhoaId: string;
  chiNhanhId: string;
  dichVuKhamId: string;
  chucDanh: DoctorTitle;
  hocVi: DoctorDegree;
  soNamKinhNghiem: number;
  moTaChuyenMon: string | null;
}

export interface SpecialtyOption {
  chuyenKhoaId: string;
  ten: string;
  /** Chuyên khoa hiện tại đã ngừng (Q19): vẫn hiện để giữ nguyên được, nhưng không chọn mới được */
  ngungHoatDong?: boolean;
}

export interface ServiceOption {
  dichVuKhamId: string;
  ten: string;
  /** `null` khi không đọc được giá (dịch vụ ngoài 100 dòng đầu của danh mục) */
  giaMacDinh: string | null;
}

export interface BranchOption {
  chiNhanhId: string;
  ten: string;
  dichVuKham: ServiceOption[];
}

export interface EditOptions {
  specialties: SpecialtyOption[];
  branches: BranchOption[];
}

/** Danh sách chặn trong `chiTiet` của 409 `DOI_CHI_NHANH_BI_CHAN` / `DOI_DICH_VU_CHINH_BI_CHAN` (B13, BS A2). */
export interface BlockingList {
  lichHen: {
    items: {
      lichHenId: string;
      maLichHen: string;
      thoiGian: string;
      trangThai: string;
    }[];
    tong: number;
  };
  ca: {
    items: { lichLamViecId: string; ngay: string; ca: string }[];
    tong: number;
  };
}
