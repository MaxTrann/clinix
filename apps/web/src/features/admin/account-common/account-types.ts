import type { AdminMe } from '../admin-me';

// Kiểu dữ liệu tài khoản của khung Admin (admin F9, dùng lại ở F8). Hình dạng khớp `GET /admin/accounts` và `GET /admin/accounts/:id` (B17),
// xem TRACKING admin 9A.3 mục 2.3. Web CHỈ đọc các khoá liệt kê ở đây; khoá lạ của API không bao giờ được vẽ ra.

export const ACCOUNT_ROLES = [
  'BenhNhan',
  'BacSi',
  'LeTan',
  'QuanTriVien',
] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const ACCOUNT_STATUSES = [
  'ChoKichHoat',
  'DangHoatDong',
  'NgungHoatDong',
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Phạm vi của người đang xem (`GET /admin/me`). */
export type AdminScopeKind = AdminMe['phamVi'];

/** Phần tối thiểu để quyết định nút nào được hiện (PLAN 5.6): hàm `accountActions` chỉ đọc ba khoá này. */
export interface AccountActionFacts {
  loaiTaiKhoan: AccountRole;
  trangThai: AccountStatus;
  /** Chỉ Toàn hệ thống × Bệnh nhân có; `null` khi chưa có dòng `benh_nhan` (chưa xác minh OTP). */
  khoaDatLichDoNoShow?: boolean | null;
}

/**
 * Bệnh nhân như API trả. Sáu trường đầu (cộng hai khoá kỹ thuật) là phần Admin Chi nhánh được xem (Q26);
 * các trường còn lại CHỈ Toàn hệ thống nhận. Web đọc theo phạm vi bằng `visibleFields` và không dựa vào việc API không trả thừa.
 */
export interface PatientAccount {
  taiKhoanId: string;
  loaiTaiKhoan: 'BenhNhan';
  hoTen: string;
  email: string;
  soDienThoai: string;
  /** `YYYY-MM-DD` */
  ngaySinh: string | null;
  gioiTinh: string | null;
  trangThai: AccountStatus;
  diaChi?: string | null;
  daXacMinhEmail?: boolean;
  /** ISO 8601 UTC */
  thoiDiemTao?: string;
  khoaDatLichDoNoShow?: boolean | null;
  soLanNoShow?: number | null;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AccountListQuery {
  page: number;
  pageSize: number;
  /** Mỗi vai trò thành một tham số `vaiTro` lặp lại. F9 luôn chỉ gửi `BenhNhan`. */
  vaiTro: readonly AccountRole[];
  trangThai?: AccountStatus;
  /** Chỉ Toàn hệ thống; Chi nhánh dùng sẽ bị API trả 403 nên `buildAccountsPath` bỏ tham số này. */
  khoaNoShow?: boolean;
  /** Chỉ Toàn hệ thống (Chi nhánh bị API bỏ qua). */
  chiNhanhId?: string;
  q?: string;
}

export interface BranchOption {
  chiNhanhId: string;
  ten: string;
}
