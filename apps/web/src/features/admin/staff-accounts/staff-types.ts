import type { AccountStatus } from '../account-common/account-types';

// Kiểu dữ liệu màn "Nhân sự" của khung Admin (admin F8). Hình dạng khớp `GET /admin/accounts` và `GET /admin/accounts/:id` (B17), khoá và mở khoá (B18),
// gửi lại liên kết kích hoạt (B20); xem TRACKING admin 9A.20 mục 1. Web CHỈ đọc các khoá liệt kê ở đây; khoá lạ của API không bao giờ được vẽ ra.

export const STAFF_ROLES = ['BacSi', 'LeTan', 'QuanTriVien'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type AdminScopeName = 'ToanHeThong' | 'ChiNhanh';

export interface StaffBranch {
  chiNhanhId: string;
  ten: string;
}

/** Liên kết kích hoạt ĐANG HIỆU LỰC của nhân sự chờ kích hoạt: chỉ trạng thái do server suy ra và hạn (ISO 8601 UTC). Không có id, băm hay token. */
export interface ActivationLink {
  trangThai: 'HOP_LE' | 'HET_HAN';
  hetHanLuc: string;
}

/**
 * Nhân sự như API trả. Danh sách và chi tiết cùng hình dạng; chỉ chi tiết có `lienKetKichHoat` (`null` khi không có liên kết đang hiệu lực).
 * `phamViQuanTri` chỉ có với Quản trị viên; `chiNhanh` là `null` với Quản trị viên Toàn hệ thống.
 */
export interface StaffAccount {
  taiKhoanId: string;
  loaiTaiKhoan: StaffRole;
  hoTen: string;
  email: string;
  soDienThoai: string;
  trangThai: AccountStatus;
  /** ISO 8601 UTC */
  thoiDiemTao: string;
  chiNhanh: StaffBranch | null;
  phamViQuanTri?: AdminScopeName | null;
  lienKetKichHoat?: ActivationLink | null;
}

export interface DependentAppointment {
  lichHenId: string;
  maLichHen: string;
  /** Giờ Việt Nam, `YYYY-MM-DD HH:mm:ss` (không mang múi giờ) */
  thoiGian: string;
  trangThai: string;
}

export interface DependentShift {
  lichLamViecId: string;
  /** `YYYY-MM-DD` */
  ngay: string;
  ca: string;
}

export interface DependentList<T> {
  /** Tổng số thật (có thể lớn hơn số mục trả về: API cắt ở 50) */
  tong: number;
  muc: T[];
}

/** Việc đang phụ thuộc vào Bác sĩ vừa bị khoá (Q28): chỉ để người có trách nhiệm bố trí lại, hệ thống không tự xử lý. */
export interface DoctorDependents {
  lichHen: DependentList<DependentAppointment>;
  caLamViec: DependentList<DependentShift>;
}

/**
 * Kết quả "Gửi lại email kích hoạt". `sent`: thư đã được máy chủ SMTP nhận (kèm hạn của liên kết MỚI). `mailFailed`: API trả 200 nhưng gửi thư lỗi, liên kết
 * mới không có hiệu lực. `unknown`: phản hồi sai hình dạng; KHÔNG BAO GIỜ coi là đã gửi.
 */
export type ResendOutcome =
  | { kind: 'sent'; hanLienKet: string | null }
  | { kind: 'mailFailed' }
  | { kind: 'unknown' };

/** Thông báo kết quả một thao tác ghi: `warning` là việc đã làm được một phần (ví dụ tài khoản vẫn đúng nhưng gửi thư lỗi). */
export interface StaffNotice {
  kind: 'success' | 'warning' | 'error';
  text: string;
}
