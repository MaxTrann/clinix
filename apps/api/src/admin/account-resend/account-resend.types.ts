import type {
  LoaiTaiKhoan,
  TrangThaiTaiKhoan,
} from '../../auth/entities/enums.js';
import type { GuiEmailResult } from '../staff-accounts/staff-account.types.js';

// Kiểu của task B20 (gửi lại liên kết kích hoạt; PLAN admin 5.5 "Gửi lại", 5.6, 7.5 TK-40…48).

/** Đích của lần gửi lại, đọc DƯỚI KHOÁ hàng `tai_khoan` (cùng điều kiện tầm nhìn của B17). */
export interface ResendTarget {
  taiKhoanId: string;
  loaiTaiKhoan: LoaiTaiKhoan;
  trangThai: TrangThaiTaiKhoan;
  /** Chi nhánh của Bác sĩ, Lễ tân, Quản trị viên Chi nhánh; `null` với Bệnh nhân và Quản trị viên Toàn hệ thống. */
  chiNhanhId: string | null;
  hoTen: string;
  email: string;
}

/**
 * Phản hồi 200 của `POST /admin/accounts/:id/resend-activation`. Cố ý CHỈ có ba khoá: không token, URL, băm, email hay mật khẩu.
 * `hanLienKet` là hạn của liên kết MỚI khi `DaGui`; `null` khi `ThatBai` (liên kết cũ còn hạn, nếu có, vẫn dùng được và F8 đọc hạn của nó ở chi tiết B17).
 */
export interface ResendActivationResponse {
  taiKhoanId: string;
  guiEmail: GuiEmailResult;
  hanLienKet: Date | null;
}
