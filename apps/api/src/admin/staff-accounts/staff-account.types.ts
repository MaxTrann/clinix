import type { ChucDanhBacSi, HocViBacSi } from '../entities/enums.js';

// Kiểu của task B15 (tạo tài khoản nhân sự; PLAN admin 5.3, 5.5, 7.4).

/** Ba vai trò nhân sự tạo được; trùng đúng giá trị của `tai_khoan.loai_tai_khoan` (không có `BenhNhan`). */
export const STAFF_ROLES = ['BacSi', 'LeTan', 'QuanTriVien'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Phạm vi của Quản trị viên mới (cột `quan_tri_vien.pham_vi_quan_tri`). */
export const ADMIN_SCOPES = ['ToanHeThong', 'ChiNhanh'] as const;
export type AdminScopeName = (typeof ADMIN_SCOPES)[number];

interface CommonFields {
  hoTen: string;
  email: string;
  soDienThoai: string;
}

export interface DoctorInput extends CommonFields {
  vaiTro: 'BacSi';
  chiNhanhId: string;
  chuyenKhoaId: string;
  dichVuKhamId: string;
  chucDanh: ChucDanhBacSi;
  hocVi: HocViBacSi;
  soNamKinhNghiem: number;
}

export interface ReceptionistInput extends CommonFields {
  vaiTro: 'LeTan';
  chiNhanhId: string;
}

export interface SystemAdminInput extends CommonFields {
  vaiTro: 'QuanTriVien';
  phamVi: 'ToanHeThong';
}

export interface BranchAdminInput extends CommonFields {
  vaiTro: 'QuanTriVien';
  phamVi: 'ChiNhanh';
  chiNhanhId: string;
}

/**
 * Đầu vào ĐÃ qua kiểm của DTO, tách theo vai trò để mã sau đó không phải đoán trường nào có: Bác sĩ có đủ 5 trường hồ sơ, Lễ tân và Quản trị viên
 * Chi nhánh có `chiNhanhId`, Quản trị viên Toàn hệ thống KHÔNG có `chiNhanhId` (CHECK `chk_qtv_pham_vi`).
 */
export type StaffAccountInput =
  DoctorInput | ReceptionistInput | SystemAdminInput | BranchAdminInput;

/**
 * Kết quả gửi email kích hoạt (PLAN 5.5, NS-19). `DaGui` khớp từ vựng email của cả cụm (`email_thong_bao`: ChoGui, DaGui, ThatBai);
 * `ThatBai` kèm `GUI_MAIL_LOI`: tài khoản và hồ sơ ĐÃ tạo ở `ChoKichHoat` nhưng liên kết chưa hiệu lực, Admin dùng "Gửi lại" (B20).
 */
export type GuiEmailResult =
  { ketQua: 'DaGui' } | { ketQua: 'ThatBai'; maLoi: 'GUI_MAIL_LOI' };

/** Phản hồi 201 của `POST /admin/staff-accounts`. Cố ý KHÔNG có token, URL, băm, mật khẩu hay hạn liên kết. */
export interface CreateStaffAccountResponse {
  taiKhoanId: string;
  loaiTaiKhoan: StaffRole;
  trangThai: 'ChoKichHoat';
  guiEmail: GuiEmailResult;
}
